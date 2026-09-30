// Kuro — bulk BACKFILL: buat task baru (backdate) SEKALIGUS jam kerjanya dari Excel.
//
// Jalankan:
//   node scripts/import-backfill.mjs "templates/Template-Bulk-Backfill.xlsx" --dry-run
//   node scripts/import-backfill.mjs "templates/Template-Bulk-Backfill.xlsx" --yes
//
// Aturan:
// - Lembar "Backfill", header baris 3, data mulai baris 4. Satu baris = satu sesi kerja.
// - Task dikelompokkan berdasarkan (Project + Judul Task). Kelompok pertama membuat task;
//   baris berikutnya hanya menambah sesi. Task yang sudah ada dipakai ulang (tidak diubah).
// - Hierarki baru: task selalu punya SUBTASK (unit kerja). Task baru dari backfill dibuatkan
//   SATU subtask bernama sama; task lama memakai subtask pertamanya (urutan position).
//   Jam kerja (time entry) selalu ditempelkan pada subtask tersebut.
// - Task di-assign ke freelancer pada baris pertama kelompok; time entry milik baris itu.
// - Semua validasi dijalankan lebih dulu; bila ada SATU baris tidak valid, tidak ada yang ditulis.
// - Menghormati rule #11 (periode terkunci) & larangan sesi tumpang tindih.
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
const MAX_TITLE = 120
const MAX_DESC = 20_000
const MAX_NOTE = 2000
const MAX_DATE = new Date('9999-12-31T23:59:59.999Z')
const PRIORITIES = ['low', 'medium', 'high']
const STATUSES = ['todo', 'in_progress', 'review', 'done', 'cancelled']

// 1-based sesuai template
const COL = {
  user: 1,
  project: 2,
  title: 3,
  description: 4,
  workType: 5,
  requester: 6,
  priority: 7,
  estimatedHours: 8,
  requestDate: 9,
  deadlineDate: 10,
  deadlineTime: 11,
  status: 12,
  inDate: 13,
  inTime: 14,
  outDate: 15,
  outTime: 16,
  note: 17,
}

const db = new PrismaClient()

const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith('--'))
const positional = args.filter((a) => !a.startsWith('--'))
const filePath = positional[0] || join(root, 'templates', 'Template-Bulk-Backfill.xlsx')
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

function parseNumber(cell) {
  const raw = cellRaw(cell)
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.').trim())
  return Number.isFinite(n) ? n : NaN
}

const wibMonthKey = (d) => formatInTimeZone(d, TZ, 'yyyy-MM')
const overlaps = (aStart, aEnd, bStart, bEnd) =>
  aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime()

/** Deskripsi aman: teks biasa, buang tag HTML. */
function sanitizeText(s) {
  return s.replace(/<[^>]*>/g, '').trim()
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
  const ws = wb.getWorksheet('Backfill')
  if (!ws) {
    console.error('✖ Lembar "Backfill" tidak ditemukan. Pakai template resmi.')
    process.exitCode = 1
    return
  }

  const [freelancers, projects, workTypes, requesters, existingTasks, locks, admin] = await Promise.all([
    db.user.findMany({ select: { id: true, name: true, email: true, role: true } }),
    db.project.findMany({ select: { id: true, name: true, isActive: true } }),
    db.workType.findMany({ select: { id: true, name: true, isActive: true } }),
    db.requester.findMany({ select: { id: true, name: true, isActive: true } }),
    db.task.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        projectId: true,
        subtasks: { select: { id: true, title: true, status: true }, orderBy: { position: 'asc' }, take: 1 },
      },
    }),
    db.periodLock.findMany({ select: { year: true, month: true } }),
    db.user.findFirst({ where: { role: 'admin', isActive: true }, orderBy: { createdAt: 'asc' } }),
  ])

  if (!admin) {
    console.error('✖ Tidak ada admin aktif untuk createdById.')
    process.exitCode = 1
    return
  }

  const userByName = new Map()
  const userByEmail = new Map()
  for (const u of freelancers) {
    userByEmail.set(norm(u.email), u)
    userByName.set(norm(u.name), u)
  }
  const resolveUser = (raw) => {
    const cleaned = raw.replace(/\(nonaktif\)/gi, '').trim()
    const emailPart = cleaned.includes('—') ? cleaned.split('—').pop().trim() : cleaned
    return userByEmail.get(norm(emailPart)) || userByName.get(norm(cleaned)) || userByName.get(norm(emailPart))
  }
  const projectMap = new Map(projects.map((p) => [norm(p.name), p]))
  const workTypeMap = new Map(workTypes.map((w) => [norm(w.name), w]))
  const requesterMap = new Map(requesters.map((r) => [norm(r.name), r]))
  const existingTaskKey = new Map(existingTasks.map((t) => [`${t.projectId}::${norm(t.title)}`, t]))
  // Subtask pertama dari task lama (untuk menempelkan jam kerja).
  const existingSubtaskKey = new Map(
    existingTasks
      .filter((t) => t.subtasks.length > 0)
      .map((t) => [`${t.projectId}::${norm(t.title)}`, t.subtasks[0]])
  )
  const lockedKeys = new Set(locks.map((l) => `${l.year}-${l.month}`))

  const errors = []
  const entries = [] // tiap sesi
  const taskGroups = new Map() // key → definisi task (dari baris pertama)

  // ---- Pass 1: baca & validasi bentuk ----
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const rawUser = cellText(row.getCell(COL.user))
    const rawProject = cellText(row.getCell(COL.project))
    const rawTitle = cellText(row.getCell(COL.title))
    const inDate = cellText(row.getCell(COL.inDate))
    const inTime = cellText(row.getCell(COL.inTime))
    const outTime = cellText(row.getCell(COL.outTime))
    if (!rawUser && !rawProject && !rawTitle && !inDate && !inTime && !outTime) continue

    const where = `Baris ${r}`
    const rowErrors = []
    const push = (msg) => rowErrors.push(`${where}: ${msg}`)

    // Freelancer
    const user = rawUser ? resolveUser(rawUser) : null
    if (!rawUser) push('freelancer wajib diisi')
    else if (!user) push(`freelancer "${rawUser}" tidak ditemukan`)
    else if (user.role !== 'freelancer') push(`"${rawUser}" bukan freelancer`)

    // Project
    const project = projectMap.get(norm(rawProject))
    if (!rawProject) push('project wajib diisi')
    else if (!project) push(`project "${rawProject}" tidak ditemukan`)
    else if (!project.isActive) push(`project "${rawProject}" nonaktif`)

    // Judul
    let title = rawTitle
    if (!rawTitle) push('judul task wajib diisi')
    else if (title.length < 3) push('judul task minimal 3 karakter')
    else if (title.length > MAX_TITLE) title = title.slice(0, MAX_TITLE)

    // Waktu
    const inDateP = parseDateOnly(row.getCell(COL.inDate))
    const inTimeP = parseTimeOnly(row.getCell(COL.inTime))
    const outTimeP = parseTimeOnly(row.getCell(COL.outTime))
    const outDateP = parseDateOnly(row.getCell(COL.outDate)) || inDateP
    if (!inDateP) push('tanggal masuk wajib, format YYYY-MM-DD')
    if (!inTimeP) push('jam masuk wajib, format HH:MM')
    if (!outTimeP) push('jam keluar wajib, format HH:MM')

    let clockInAt = null
    let clockOutAt = null
    if (inDateP && inTimeP && outTimeP) {
      clockInAt = fromZonedTime(`${inDateP}T${inTimeP}`, TZ)
      clockOutAt = fromZonedTime(`${outDateP}T${outTimeP}`, TZ)
      if (Number.isNaN(clockInAt.getTime())) push('jam masuk tidak valid')
      else if (Number.isNaN(clockOutAt.getTime())) push('jam keluar tidak valid')
      else if (clockOutAt.getTime() <= clockInAt.getTime())
        push('jam keluar harus setelah jam masuk (isi "Tanggal Keluar" bila lewat tengah malam)')
    }

    let note = cellText(row.getCell(COL.note)) || null
    if (note && note.length > MAX_NOTE) push(`catatan melebihi ${MAX_NOTE} karakter`)

    if (rowErrors.length) {
      errors.push(...rowErrors)
      continue
    }

    const key = `${project.id}::${norm(title)}`

    // Definisi task: hanya diambil dari baris PERTAMA untuk key ini.
    if (!taskGroups.has(key)) {
      const wt = workTypeMap.get(norm(cellText(row.getCell(COL.workType))))
      const rq = requesterMap.get(norm(cellText(row.getCell(COL.requester))))
      const gErr = []
      const wtText = cellText(row.getCell(COL.workType))
      const rqText = cellText(row.getCell(COL.requester))
      if (!wtText) gErr.push('jenis pekerjaan wajib diisi')
      else if (!wt) gErr.push(`jenis pekerjaan "${wtText}" tidak ditemukan`)
      else if (!wt.isActive) gErr.push(`jenis pekerjaan "${wtText}" nonaktif`)
      if (!rqText) gErr.push('requester wajib diisi')
      else if (!rq) gErr.push(`requester "${rqText}" tidak ditemukan`)
      else if (!rq.isActive) gErr.push(`requester "${rqText}" nonaktif`)

      let description = sanitizeText(cellText(row.getCell(COL.description)))
      if (description && description.length > MAX_DESC) gErr.push(`deskripsi melebihi ${MAX_DESC} karakter`)
      description = description || null

      const prRaw = norm(cellText(row.getCell(COL.priority))) || 'medium'
      const priority = PRIORITIES.includes(prRaw) ? prRaw : null
      if (!priority) gErr.push(`prioritas "${cellText(row.getCell(COL.priority))}" tidak valid`)

      let estimatedHours = parseNumber(row.getCell(COL.estimatedHours))
      if (estimatedHours !== null) {
        if (Number.isNaN(estimatedHours) || estimatedHours <= 0) gErr.push('estimasi harus angka > 0')
        else if (estimatedHours > 500) gErr.push('estimasi maksimal 500 jam')
        else if ((estimatedHours * 2) % 1 !== 0) gErr.push('estimasi harus kelipatan 0,5')
        else estimatedHours = Math.round(estimatedHours * 10) / 10
      } else estimatedHours = null

      const stRaw = norm(cellText(row.getCell(COL.status))) || 'done'
      const status = STATUSES.includes(stRaw) ? stRaw : null
      if (!status) gErr.push(`status "${cellText(row.getCell(COL.status))}" tidak valid`)

      const requestDateP = parseDateOnly(row.getCell(COL.requestDate)) || inDateP
      const deadlineDateP = parseDateOnly(row.getCell(COL.deadlineDate))
      const deadlineTimeP = parseTimeOnly(row.getCell(COL.deadlineTime)) || '17:00'
      if (cellText(row.getCell(COL.requestDate)) && !parseDateOnly(row.getCell(COL.requestDate)))
        gErr.push('tanggal request tidak valid (YYYY-MM-DD)')
      if (cellText(row.getCell(COL.deadlineDate)) && !deadlineDateP)
        gErr.push('deadline tidak valid (YYYY-MM-DD)')

      // Deadline default: requestDate + 7 hari
      let deadlineAt
      if (deadlineDateP) {
        deadlineAt = fromZonedTime(`${deadlineDateP}T${deadlineTimeP}`, TZ)
      } else {
        const base = requestDateP
        const d = new Date(`${base}T00:00:00Z`)
        d.setUTCDate(d.getUTCDate() + 7)
        deadlineAt = fromZonedTime(`${d.toISOString().slice(0, 10)}T${deadlineTimeP}`, TZ)
      }

      if (gErr.length) {
        errors.push(...gErr.map((m) => `${where} (task): ${m}`))
        continue
      }

      const existing = existingTaskKey.get(key)
      const existingSubtask = existingSubtaskKey.get(key)
      taskGroups.set(key, {
        key,
        row: r,
        projectId: project.id,
        projectName: project.name,
        title,
        description,
        workTypeId: wt.id,
        workTypeName: wt.name,
        requesterId: rq.id,
        requesterName: rq.name,
        priority,
        estimatedHours,
        requestDate: requestDateP,
        deadlineAt,
        status,
        assigneeId: user.id,
        assigneeName: user.name,
        existingId: existing ? existing.id : null,
        existingStatus: existing ? existing.status : null,
        existingSubtaskId: existingSubtask ? existingSubtask.id : null,
        existingSubtaskStatus: existingSubtask ? existingSubtask.status : null,
      })
    }

    entries.push({
      row: r,
      key,
      userId: user.id,
      userName: user.name,
      clockInAt,
      clockOutAt,
      note,
    })
  }

  // ---- Pass 2: validasi periode & tumpang tindih (dengan data lama + antar baris) ----
  // Selalu dijalankan (walau pass 1 sudah menemukan error) agar semua masalah terlaporkan sekaligus.
  let duplicateCount = 0
  {
    const userIds = new Set(entries.map((e) => e.userId))
    const existing = userIds.size
      ? await db.timeEntry.findMany({
          where: { userId: { in: Array.from(userIds) } },
          select: { userId: true, subtaskId: true, clockInAt: true, clockOutAt: true },
        })
      : []
    const existingByUser = new Map()
    const existingKeys = new Set()
    for (const e of existing) {
      const list = existingByUser.get(e.userId) ?? []
      list.push(e)
      existingByUser.set(e.userId, list)
      existingKeys.add(`${e.userId}::${e.subtaskId}::${e.clockInAt.getTime()}`)
    }
    const accepted = new Map() // userId → sesi yang lolos
    let dupCount = 0
    for (const e of entries) {
      const where = `Baris ${e.row}`
      const group = taskGroups.get(e.key)
      // Duplikat: sesi identik (user + subtask + jam masuk) sudah ada di database
      if (
        group?.existingSubtaskId &&
        existingKeys.has(`${e.userId}::${group.existingSubtaskId}::${e.clockInAt.getTime()}`)
      ) {
        e.duplicate = true
        dupCount += 1
        continue
      }
      // Duplikat antar baris di file ini (task baru maupun lama)
      const seen = accepted.get(e.userId) ?? []
      if (seen.some((x) => x.key === e.key && x.clockInAt.getTime() === e.clockInAt.getTime())) {
        e.duplicate = true
        dupCount += 1
        continue
      }
      if (lockedKeys.has(wibMonthKey(e.clockInAt)) || lockedKeys.has(wibMonthKey(e.clockOutAt))) {
        errors.push(`${where}: periode (bulan) sudah dikunci`)
        continue
      }
      const hitOld = (existingByUser.get(e.userId) ?? []).some((x) =>
        overlaps(e.clockInAt, e.clockOutAt, x.clockInAt, x.clockOutAt ?? MAX_DATE)
      )
      if (hitOld) {
        errors.push(`${where}: tumpang tindih dengan sesi kerja lain yang sudah ada`)
        continue
      }
      const hitNew = seen.find((x) => overlaps(e.clockInAt, e.clockOutAt, x.clockInAt, x.clockOutAt))
      if (hitNew) {
        errors.push(`${where}: tumpang tindih dengan baris ${hitNew.row} di file ini`)
        continue
      }
      seen.push({ ...e, row: e.row, key: e.key, clockInAt: e.clockInAt, clockOutAt: e.clockOutAt })
      accepted.set(e.userId, seen)
    }
    duplicateCount = dupCount
  }

  const groups = Array.from(taskGroups.values())
  const importedEntries = entries.filter((e) => !e.duplicate)
  // Task baru yang seluruh sesinya duplikat → tidak perlu dibuat.
  const keysWithEntries = new Set(importedEntries.map((e) => e.key))
  const toCreate = groups.filter((g) => !g.existingId && keysWithEntries.has(g.key))
  const reused = groups.filter((g) => g.existingId)

  console.log(
    `Ditemukan ${entries.length} sesi kerja dalam ${groups.length} task ` +
      `(${toCreate.length} task baru, ${reused.length} task sudah ada dipakai ulang` +
      (duplicateCount ? `, ${duplicateCount} sesi duplikat dilewati` : '') +
      ').'
  )

  if (errors.length) {
    console.error(`\n✖ ${errors.length} masalah ditemukan — tidak ada data yang ditulis:`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exitCode = 1
    return
  }

  if (!importedEntries.length) {
    console.log('Tidak ada sesi baru untuk diimpor. Selesai.')
    return
  }

  if (dryRun) {
    console.log('\nMode uji (dry-run).\nTask:')
    for (const g of groups.slice(0, 12)) {
      console.log(
        `  ${g.existingId ? '[pakai ulang]' : '[baru]'} ${g.projectName} / ${g.title} | ` +
          `${g.workTypeName} / ${g.requesterName} | ${g.priority} | ${g.estimatedHours ?? '-'}j | ` +
          `${g.requestDate} → ${g.deadlineAt.toISOString()} | ${g.status} | assignee=${g.assigneeName}`
      )
    }
    console.log('\nSesi kerja (10 pertama):')
    let total = 0
    for (const e of importedEntries) {
      const mins = Math.floor((e.clockOutAt.getTime() - e.clockInAt.getTime()) / 60_000)
      total += mins
      console.log(
        `  #${e.row} ${e.userName} | ${e.clockInAt.toISOString()} → ${e.clockOutAt.toISOString()} (${mins}m)`
      )
    }
    console.log(`\nTotal durasi: ${total} menit`)
    console.log('Tidak ada yang ditulis. Jalankan ulang dengan --yes untuk menyimpan.')
    return
  }

  await db.$transaction(
    async (tx) => {
      const idByKey = new Map()
      // Task lama tanpa subtask baru → lewati sesinya (tidak bisa ditempeli jam).
      for (const g of reused) {
        idByKey.set(g.key, g.existingSubtaskId)
      }
      // Hanya buat task yang benar-benar punya sesi baru (idempoten).
      for (const g of toCreate) {
        // Buat task + SATU subtask default (unit kerja untuk menempelkan jam).
        const created = await tx.task.create({
          data: {
            title: g.title,
            description: g.description,
            projectId: g.projectId,
            // Impor backfill selalu masuk Backlog; pindahkan ke sprint lewat UI.
            sprintId: null,
            workTypeId: g.workTypeId,
            requesterId: g.requesterId,
            priority: g.priority,
            estimatedHours: g.estimatedHours,
            requestDate: new Date(`${g.requestDate}T00:00:00.000Z`),
            deadlineAt: g.deadlineAt,
            status: g.status,
            createdById: admin.id,
            assignees: { create: [{ userId: g.assigneeId }] },
            subtasks: {
              create: [
                {
                  title: g.title.slice(0, 150),
                  assigneeId: g.assigneeId,
                  status: g.status,
                  position: 0,
                  estimatedHours: g.estimatedHours,
                },
              ],
            },
          },
          include: { subtasks: { orderBy: { position: 'asc' }, take: 1 } },
        })
        idByKey.set(g.key, created.subtasks[0].id)
        await tx.activityLog.create({
          data: {
            userId: admin.id,
            action: 'task_created',
            entityType: 'task',
            entityId: created.id,
            newValue: {
              title: g.title,
              projectId: g.projectId,
              workTypeId: g.workTypeId,
              requesterId: g.requesterId,
              assigneeId: g.assigneeId,
              priority: g.priority,
              estimatedHours: g.estimatedHours,
              requestDate: g.requestDate,
              deadlineAt: g.deadlineAt,
              source: 'bulk_backfill',
            },
            description: `${admin.name} membuat task lama "${g.title}" (bulk backfill)`,
          },
        })
      }

      for (const e of importedEntries) {
        const subtaskId = idByKey.get(e.key)
        if (!subtaskId) continue
        const group = taskGroups.get(e.key)
        const created = await tx.timeEntry.create({
          data: {
            userId: e.userId,
            subtaskId,
            clockInAt: e.clockInAt,
            clockOutAt: e.clockOutAt,
            note: e.note,
            taskStatusAtCheckout: group.status,
          },
        })
        await tx.activityLog.create({
          data: {
            userId: admin.id,
            action: 'time_entry_backfilled',
            entityType: 'time_entry',
            entityId: created.id,
            newValue: {
              userId: e.userId,
              subtaskId,
              clockInAt: e.clockInAt,
              clockOutAt: e.clockOutAt,
              source: 'bulk_backfill',
            },
            description: `${admin.name} menyuntik sesi kerja lama milik ${e.userName} untuk task "${group.title}" (bulk backfill)`,
          },
        })
      }
    },
    { timeout: 180_000, maxWait: 15_000 }
  )

  console.log(`\n✔ Selesai: ${toCreate.length} task baru dibuat, ${reused.length} task dipakai ulang, ${importedEntries.length} sesi kerja ditambahkan.`)
}

main()
  .catch((e) => {
    console.error('✖ Gagal impor:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
