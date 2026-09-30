// Kuro — bulk import Time Entry (backdate / suntik data historis) dari Excel.
//
// Jalankan:
//   node scripts/import-time-entries.mjs "templates/Template-Bulk-TimeEntry.xlsx" --dry-run
//   node scripts/import-time-entries.mjs "templates/Template-Bulk-TimeEntry.xlsx" --yes
//
// Aturan:
// - Membaca lembar "TimeEntry", header di baris 3, data mulai baris 4.
// - Freelancer/project dicocokkan berdasarkan NAMA; SUBTASK berdasarkan ID atau judul
//   persis di dalam project tersebut (bila judul hanya cocok dengan judul TASK dan task
//   itu punya tepat satu subtask, subtask tersebut dipakai).
// - Semua waktu dianggap WIB (Asia/Jakarta), disimpan UTC.
// - Validasi penuh lebih dulu; bila ada SATU saja baris tidak valid, tidak ada yang ditulis.
// - Menghormati rule #11 (periode terkunci) dan larangan sesi tumpang tindih.
// - Task TIDAK diubah — hanya jam kerja (time entry pada subtask) yang ditambahkan.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

const TZ = 'Asia/Jakarta'
const FIRST_DATA_ROW = 4
const MAX_NOTE = 2000
const MAX_DATE = new Date('9999-12-31T23:59:59.999Z')

const COL = { user: 1, project: 2, task: 3, inDate: 4, inTime: 5, outDate: 6, outTime: 7, note: 8 }

const db = new PrismaClient()

const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith('--'))
const positional = args.filter((a) => !a.startsWith('--'))
const filePath = positional[0] || join(root, 'templates', 'Template-Bulk-TimeEntry.xlsx')
const explicitYes = flags.includes('--yes')
const dryRun = !explicitYes

const norm = (v) => (v == null ? '' : String(v).trim()).replace(/\s+/g, ' ').toLowerCase()

function cellRaw(cell) {
  const v = cell.value
  if (v != null && typeof v === 'object' && 'richText' in v) return v.richText.map((r) => r.text).join('')
  if (v != null && typeof v === 'object' && 'text' in v) return String(v.text)
  return v
}

function cellText(cell) {
  const v = cellRaw(cell)
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v).trim()
}

function parseDateOnly(cell) {
  const raw = cellRaw(cell)
  if (raw == null || raw === '') return null
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null
    return raw.toISOString().slice(0, 10)
  }
  const s = String(raw).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

function parseTimeOnly(cell) {
  const raw = cellRaw(cell)
  if (raw == null || raw === '') return null
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null
    return `${String(raw.getUTCHours()).padStart(2, '0')}:${String(raw.getUTCMinutes()).padStart(2, '0')}`
  }
  const m = String(raw).trim().match(/^(\d{1,2})[:.](\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

const wibMonthKey = (d) => formatInTimeZone(d, TZ, 'yyyy-MM')

/** Dua interval [aStart,aEnd) & [bStart,bEnd) tumpang tindih? */
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime()
}

async function main() {
  const abs = resolve(root, filePath)
  if (!existsSync(abs)) {
    console.error(`✖ File tidak ditemukan: ${abs}`)
    process.exitCode = 1
    return
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(abs)
  const ws = wb.getWorksheet('TimeEntry')
  if (!ws) {
    console.error('✖ Lembar "TimeEntry" tidak ditemukan. Pakai template resmi.')
    process.exitCode = 1
    return
  }

  const [freelancers, projects, subtasks, locks, admin] = await Promise.all([
    db.user.findMany({ select: { id: true, name: true, email: true, role: true } }),
    db.project.findMany({ select: { id: true, name: true, isActive: true } }),
    db.subtask.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        task: { select: { id: true, title: true, projectId: true, project: { select: { name: true } } } },
      },
    }),
    db.periodLock.findMany({ select: { year: true, month: true } }),
    db.user.findFirst({ where: { role: 'admin', isActive: true }, orderBy: { createdAt: 'asc' } }),
  ])

  if (!admin) {
    console.error('✖ Tidak ada admin aktif untuk mencatat audit import.')
    process.exitCode = 1
    return
  }

  const userByName = new Map()
  const userByEmail = new Map()
  for (const u of freelancers) {
    userByEmail.set(norm(u.email), u)
    userByName.set(norm(u.name), u)
  }
  const projectMap = new Map(projects.map((p) => [norm(p.name), p]))
  const subtaskById = new Map(subtasks.map((s) => [s.id, s]))
  const subtaskByProjectTitle = new Map(
    subtasks.map((s) => [`${s.task.projectId}::${norm(s.title)}`, s])
  )
  // Fallback: task berjudul sama yang hanya punya satu subtask
  const subtaskCountByTask = new Map()
  for (const s of subtasks) subtaskCountByTask.set(s.taskId, (subtaskCountByTask.get(s.taskId) ?? 0) + 1)
  const singleSubtaskByTaskTitle = new Map()
  for (const s of subtasks) {
    if (subtaskCountByTask.get(s.taskId) === 1) {
      singleSubtaskByTaskTitle.set(`${s.task.projectId}::${norm(s.task.title)}`, s)
    }
  }
  const lockedKeys = new Set(locks.map((l) => `${l.year}-${l.month}`))

  const errors = []
  const rows = []

  // Sesi yang sudah ada per user → untuk cek tumpang tindih & duplikat.
  const userIds = new Set()
  const rowCount = ws.rowCount
  for (let r = FIRST_DATA_ROW; r <= rowCount; r++) {
    const rawUser = cellText(ws.getRow(r).getCell(COL.user))
    if (!rawUser) continue
    const cleaned = rawUser.replace(/\(nonaktif\)/gi, '').trim()
    const emailPart = cleaned.includes('—') ? cleaned.split('—').pop().trim() : cleaned
    const u = userByEmail.get(norm(emailPart)) || userByName.get(norm(cleaned)) || userByName.get(norm(emailPart))
    if (u) userIds.add(u.id)
  }

  const existing = userIds.size
    ? await db.timeEntry.findMany({
        where: { userId: { in: Array.from(userIds) } },
        select: { userId: true, subtaskId: true, clockInAt: true, clockOutAt: true },
      })
    : []
  const existingByUser = new Map()
  for (const e of existing) {
    const list = existingByUser.get(e.userId) ?? []
    list.push(e)
    existingByUser.set(e.userId, list)
  }
  const newByUser = new Map()

  for (let r = FIRST_DATA_ROW; r <= rowCount; r++) {
    const row = ws.getRow(r)
    const rawUser = cellText(row.getCell(COL.user))
    const rawTask = cellText(row.getCell(COL.task))
    // Lewati baris kosong sepenuhnya
    if (!rawUser && !rawTask) continue
    const where = `Baris ${r}`
    const rowErrors = []
    const push = (msg) => rowErrors.push(`${where}: ${msg}`)

    // Freelancer
    const cleaned = rawUser.replace(/\(nonaktif\)/gi, '').trim()
    const emailPart = cleaned.includes('—') ? cleaned.split('—').pop().trim() : cleaned
    const user = userByEmail.get(norm(emailPart)) || userByName.get(norm(cleaned)) || userByName.get(norm(emailPart))
    if (!rawUser) push('freelancer wajib diisi')
    else if (!user) push(`freelancer "${rawUser}" tidak ditemukan`)
    else if (user.role !== 'freelancer') push(`"${rawUser}" bukan freelancer`)

    // Project
    const projectName = cellText(row.getCell(COL.project))
    const project = projectMap.get(norm(projectName))
    if (!projectName) push('project wajib diisi')
    else if (!project) push(`project "${projectName}" tidak ditemukan`)
    else if (!project.isActive) push(`project "${projectName}" nonaktif`)

    // Subtask (ID atau judul persis di dalam project)
    let subtask = null
    if (!rawTask) push('judul subtask wajib diisi')
    else {
      subtask =
        subtaskById.get(rawTask) ??
        (project ? subtaskByProjectTitle.get(`${project.id}::${norm(rawTask)}`) : null) ??
        (project ? singleSubtaskByTaskTitle.get(`${project.id}::${norm(rawTask)}`) : null)
      if (!subtask) push(`subtask/task "${rawTask}" tidak ditemukan di project ini`)
      else if (project && subtask.task.projectId !== project.id)
        push(`subtask "${rawTask}" ada di project "${subtask.task.project.name}", bukan "${project.name}"`)
    }

    // Tanggal & jam
    const inDate = parseDateOnly(row.getCell(COL.inDate))
    const inTime = parseTimeOnly(row.getCell(COL.inTime))
    const outTime = parseTimeOnly(row.getCell(COL.outTime))
    const outDate = parseDateOnly(row.getCell(COL.outDate)) || inDate

    if (!inDate) push('tanggal masuk wajib, format YYYY-MM-DD')
    if (!inTime) push('jam masuk wajib, format HH:MM')
    if (!outTime) push('jam keluar wajib, format HH:MM')

    let clockInAt = null
    let clockOutAt = null
    if (inDate && inTime && outTime) {
      clockInAt = fromZonedTime(`${inDate}T${inTime}`, TZ)
      clockOutAt = fromZonedTime(`${outDate}T${outTime}`, TZ)
      if (Number.isNaN(clockInAt.getTime())) push('jam masuk tidak valid')
      else if (Number.isNaN(clockOutAt.getTime())) push('jam keluar tidak valid')
      else if (clockOutAt.getTime() <= clockInAt.getTime())
        push('jam keluar harus setelah jam masuk (isi "Tanggal Keluar" bila lewat tengah malam)')
    }

    // Catatan
    let note = cellText(row.getCell(COL.note)) || null
    if (note && note.length > MAX_NOTE) push(`catatan melebihi ${MAX_NOTE} karakter`)

    // Periode terkunci (rule #11)
    if (clockInAt && lockedKeys.has(wibMonthKey(clockInAt))) push('periode (bulan jam masuk) sudah dikunci')
    if (clockOutAt && lockedKeys.has(wibMonthKey(clockOutAt))) push('periode (bulan jam keluar) sudah dikunci')

    if (rowErrors.length) {
      errors.push(...rowErrors)
      continue
    }

    // Duplikat: sesi identik (user + subtask + jam masuk) sudah ada
    const dupe =
      (existingByUser.get(user.id) ?? []).some(
        (e) => e.subtaskId === subtask.id && e.clockInAt.getTime() === clockInAt.getTime()
      ) ||
      (newByUser.get(user.id) ?? []).some(
        (e) => e.subtaskId === subtask.id && e.clockInAt.getTime() === clockInAt.getTime()
      )
    if (dupe) {
      rows.push({ row: r, duplicate: true, title: subtask.title, user: user.name, clockInAt })
      continue
    }

    // Tumpang tindih dengan sesi lama
    const againstExisting = (existingByUser.get(user.id) ?? []).some((e) =>
      overlaps(clockInAt, clockOutAt, e.clockInAt, e.clockOutAt ?? MAX_DATE)
    )
    if (againstExisting) {
      push('tumpang tindih dengan sesi kerja lain yang sudah ada')
      errors.push(...rowErrors)
      continue
    }

    // Tumpang tindih dengan baris lain di file ini
    const pending = newByUser.get(user.id) ?? []
    const againstNew = pending.find((e) => overlaps(clockInAt, clockOutAt, e.clockInAt, e.clockOutAt))
    if (againstNew) {
      push(`tumpang tindih dengan baris ${againstNew.row} di file ini`)
      errors.push(...rowErrors)
      continue
    }

    const item = {
      row: r,
      duplicate: false,
      userId: user.id,
      userName: user.name,
      projectName: project.name,
      subtaskId: subtask.id,
      subtaskTitle: subtask.title,
      taskStatusAtCheckout: subtask.status,
      clockInAt,
      clockOutAt,
      note,
    }
    pending.push(item)
    newByUser.set(user.id, pending)
    rows.push(item)
  }

  const toImport = rows.filter((r) => !r.duplicate)
  const dupCount = rows.length - toImport.length

  console.log(`Ditemukan ${rows.length} baris berisi data (${toImport.length} baru, ${dupCount} duplikat dilewati).`)

  if (errors.length) {
    console.error(`\n✖ ${errors.length} masalah ditemukan — tidak ada data yang ditulis:`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exitCode = 1
    return
  }

  if (!toImport.length) {
    console.log('Tidak ada sesi baru untuk diimpor. Selesai.')
    return
  }

  if (dryRun) {
    console.log('\nMode uji (dry-run). Ringkasan 10 baris pertama:')
    for (const r of toImport.slice(0, 10)) {
      const mins = Math.floor((r.clockOutAt.getTime() - r.clockInAt.getTime()) / 60_000)
      console.log(
        `  #${r.row} ${r.userName} | ${r.projectName} / ${r.subtaskTitle} | ` +
          `${r.clockInAt.toISOString()} → ${r.clockOutAt.toISOString()} (${mins}m)`
      )
    }
    console.log(`\nTotal durasi: ${toImport.reduce((s, r) => s + Math.floor((r.clockOutAt.getTime() - r.clockInAt.getTime()) / 60_000), 0)} menit`)
    console.log('Tidak ada yang ditulis. Jalankan ulang dengan --yes untuk menyimpan ke database.')
    return
  }

  await db.$transaction(
    async (tx) => {
      for (const r of toImport) {
        const created = await tx.timeEntry.create({
          data: {
            userId: r.userId,
            subtaskId: r.subtaskId,
            clockInAt: r.clockInAt,
            clockOutAt: r.clockOutAt,
            note: r.note,
            taskStatusAtCheckout: r.taskStatusAtCheckout,
          },
        })
        await tx.activityLog.create({
          data: {
            userId: admin.id,
            action: 'time_entry_backfilled',
            entityType: 'time_entry',
            entityId: created.id,
            newValue: {
              userId: r.userId,
              subtaskId: r.subtaskId,
              clockInAt: r.clockInAt,
              clockOutAt: r.clockOutAt,
              source: 'bulk_import_backdate',
            },
            description: `${admin.name} menyuntik sesi kerja lama untuk ${r.userName} pada subtask "${r.subtaskTitle}" (bulk Excel)`,
          },
        })
      }
    },
    { timeout: 120_000, maxWait: 15_000 }
  )

  console.log(`\n✔ ${toImport.length} sesi kerja berhasil ditambahkan ke database.`)
}

main()
  .catch((e) => {
    console.error('✖ Gagal impor:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
