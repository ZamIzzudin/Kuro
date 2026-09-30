// Kuro — bulk import Task dari file Excel (template Template-Bulk-Task.xlsx).
// Jalankan:
//   node scripts/import-tasks.mjs "templates/Template-Bulk-Task.xlsx" --dry-run   (uji, tidak menulis)
//   node scripts/import-tasks.mjs "templates/Template-Bulk-Task.xlsx" --yes       (tulis ke DB)
//
// Aturan:
// - Membaca lembar "Task", header di baris 3, data mulai baris 4. Baris tanpa judul dilewati.
// - Semua referensi (project/jenis pekerjaan/requester/assignee) dicocokkan berdasarkan NAMA.
// - Validasi penuh dijalankan lebih dulu; bila ada SATU saja baris tidak valid, tidak ada
//   yang ditulis (atomik). Gunakan --dry-run untuk melihat hasil validasi.
// - Tanggal/jam dianggap WIB (Asia/Jakarta), disimpan UTC.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'
import { fromZonedTime } from 'date-fns-tz'

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
// - Deskripsi task memakai batas 20.000 karakter (Markdown).
const MAX_DESC = 20_000
const STATUSES = ['todo', 'in_progress', 'review', 'done', 'cancelled']
const PRIORITIES = ['low', 'medium', 'high']

// Peta kolom (1-based) sesuai template.
const COL = {
  title: 1,
  description: 2,
  project: 3,
  workType: 4,
  requester: 5,
  assignee: 6,
  priority: 7,
  estimatedHours: 8,
  requestDate: 9,
  deadlineDate: 10,
  deadlineTime: 11,
  status: 12,
}

const db = new PrismaClient()

const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith('--'))
const positional = args.filter((a) => !a.startsWith('--'))
const filePath = positional[0] || join(root, 'templates', 'Template-Bulk-Task.xlsx')
const dryRun = flags.includes('--dry-run') || !flags.includes('--yes')
const explicitYes = flags.includes('--yes')

const norm = (v) => (v == null ? '' : String(v).trim()).replace(/\s+/g, ' ').toLowerCase()

function cellText(cell) {
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((r) => r.text).join('')
  if (typeof v === 'object' && 'text' in v) return String(v.text)
  if (v instanceof Date) return v.toISOString()
  return String(v).trim()
}

function cellRaw(cell) {
  const v = cell.value
  if (v != null && typeof v === 'object' && 'richText' in v)
    return v.richText.map((r) => r.text).join('')
  if (v != null && typeof v === 'object' && 'text' in v) return String(v.text)
  return v
}

/** Ambil tanggal (yyyy-MM-dd) dari sel Excel (Date asli atau teks). */
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
  if (m) {
    const d = m[1].padStart(2, '0')
    const mo = m[2].padStart(2, '0')
    return `${m[3]}-${mo}-${d}`
  }
  return null
}

/** Ambil jam (HH:MM) dari sel Excel. */
function parseTimeOnly(cell) {
  const raw = cellRaw(cell)
  if (raw == null || raw === '') return null
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null
    const h = String(raw.getUTCHours()).padStart(2, '0')
    const mi = String(raw.getUTCMinutes()).padStart(2, '0')
    return `${h}:${mi}`
  }
  const s = String(raw).trim()
  const m = s.match(/^(\d{1,2})[:.](\d{2})/)
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

async function main() {
  const abs = resolve(root, filePath)
  if (!existsSync(abs)) {
    console.error(`✖ File tidak ditemukan: ${abs}`)
    process.exitCode = 1
    return
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(abs)
  const ws = wb.getWorksheet('Task')
  if (!ws) {
    console.error('✖ Lembar "Task" tidak ditemukan. Pakai template resmi.')
    process.exitCode = 1
    return
  }

  // Muat referensi
  const [projects, workTypes, requesters, users] = await Promise.all([
    db.project.findMany({ select: { id: true, name: true, isActive: true } }),
    db.workType.findMany({ select: { id: true, name: true, isActive: true } }),
    db.requester.findMany({ select: { id: true, name: true, isActive: true } }),
    db.user.findMany({ select: { id: true, name: true, email: true, role: true, isActive: true } }),
  ])

  const byName = (list) => {
    const map = new Map()
    for (const x of list) map.set(norm(x.name), x)
    return map
  }
  const projectMap = byName(projects)
  const workTypeMap = byName(workTypes)
  const requesterMap = byName(requesters)
  // Assignee boleh cocok lewat nama atau "Nama — email" / email.
  const userByName = new Map()
  const userByEmail = new Map()
  for (const u of users) userByEmail.set(norm(u.email), u)
  for (const u of users) userByName.set(norm(u.name), u)

  const admin = await db.user.findFirst({ where: { role: 'admin', isActive: true }, orderBy: { createdAt: 'asc' } })
  if (!admin) {
    console.error('✖ Tidak ada admin aktif untuk mengisi createdById.')
    process.exitCode = 1
    return
  }

  const errors = []
  const rows = []
  const rowCount = ws.rowCount

  for (let r = FIRST_DATA_ROW; r <= rowCount; r++) {
    const row = ws.getRow(r)
    const title = cellText(row.getCell(COL.title))
    if (!title) continue // baris kosong → lewati

    const where = `Baris ${r}`
    const rowErrors = []
    const push = (msg) => rowErrors.push(`${where}: ${msg}`)

    // Judul
    let tTitle = title
    if (tTitle.length < 3) push('judul minimal 3 karakter')
    if (tTitle.length > MAX_TITLE) tTitle = tTitle.slice(0, MAX_TITLE)

    // Deskripsi
    let description = cellText(row.getCell(COL.description)) || null
    if (description && description.length > MAX_DESC) push(`deskripsi melebihi ${MAX_DESC} karakter`)

    // Project
    const projectName = cellText(row.getCell(COL.project))
    const project = projectMap.get(norm(projectName))
    if (!projectName) push('project wajib diisi')
    else if (!project) push(`project "${projectName}" tidak ditemukan`)
    else if (!project.isActive) push(`project "${projectName}" nonaktif`)

    // Jenis pekerjaan
    const wtName = cellText(row.getCell(COL.workType))
    const workType = workTypeMap.get(norm(wtName))
    if (!wtName) push('jenis pekerjaan wajib diisi')
    else if (!workType) push(`jenis pekerjaan "${wtName}" tidak ditemukan`)
    else if (!workType.isActive) push(`jenis pekerjaan "${wtName}" nonaktif`)

    // Requester
    const reqName = cellText(row.getCell(COL.requester))
    const requester = requesterMap.get(norm(reqName))
    if (!reqName) push('requester wajib diisi')
    else if (!requester) push(`requester "${reqName}" tidak ditemukan`)
    else if (!requester.isActive) push(`requester "${reqName}" nonaktif`)

    // Assignee (opsional)
    const assigneeRaw = cellText(row.getCell(COL.assignee))
    let assignee = null
    if (assigneeRaw) {
      const cleaned = assigneeRaw.replace(/\(kosongkan.*?\)/gi, '').trim()
      const emailPart = cleaned.includes('—')
        ? cleaned.split('—').pop().trim()
        : cleaned.includes(' - ')
          ? cleaned.split(' - ').pop().trim()
          : cleaned
      assignee = userByEmail.get(norm(emailPart)) || userByName.get(norm(cleaned)) || userByName.get(norm(emailPart))
      if (!assignee) push(`assignee "${assigneeRaw}" tidak ditemukan (isi nama atau email freelancer)`)
      else if (assignee.role !== 'freelancer') push(`assignee "${assigneeRaw}" bukan freelancer`)
      else if (!assignee.isActive) push(`assignee "${assigneeRaw}" nonaktif`)
    }

    // Prioritas
    const prRaw = norm(cellText(row.getCell(COL.priority))) || 'medium'
    const priority = PRIORITIES.includes(prRaw) ? prRaw : null
    if (!priority) push(`prioritas "${cellText(row.getCell(COL.priority))}" tidak valid (low/medium/high)`)

    // Estimasi
    let estimatedHours = parseNumber(row.getCell(COL.estimatedHours))
    if (estimatedHours !== null) {
      if (Number.isNaN(estimatedHours) || estimatedHours <= 0) push('estimasi harus angka > 0')
      else if (estimatedHours > 500) push('estimasi maksimal 500 jam')
      else if ((estimatedHours * 2) % 1 !== 0) push('estimasi harus kelipatan 0,5')
      else estimatedHours = Math.round(estimatedHours * 10) / 10
    } else estimatedHours = null

    // Tanggal request
    const requestDate = parseDateOnly(row.getCell(COL.requestDate))
    if (!requestDate) push('tanggal request wajib, format YYYY-MM-DD')

    // Deadline
    const deadlineDate = parseDateOnly(row.getCell(COL.deadlineDate))
    const deadlineTime = parseTimeOnly(row.getCell(COL.deadlineTime)) || '17:00'
    if (!deadlineDate) push('deadline wajib, format YYYY-MM-DD')

    // Status
    const stRaw = norm(cellText(row.getCell(COL.status))) || 'todo'
    const status = STATUSES.includes(stRaw) ? stRaw : null
    if (!status) push(`status "${cellText(row.getCell(COL.status))}" tidak valid`)

    if (rowErrors.length) {
      errors.push(...rowErrors)
      continue
    }

    let deadlineAt = null
    if (deadlineDate) {
      deadlineAt = fromZonedTime(`${deadlineDate}T${deadlineTime}`, TZ)
      if (Number.isNaN(deadlineAt.getTime())) {
        push('deadline tidak valid')
        continue
      }
    }

    rows.push({
      row: r,
      title: tTitle,
      description,
      projectId: project.id,
      projectName: project.name,
      workTypeId: workType.id,
      workTypeName: workType.name,
      requesterId: requester.id,
      requesterName: requester.name,
      assigneeId: assignee ? assignee.id : null,
      assigneeName: assignee ? assignee.name : null,
      priority,
      estimatedHours,
      requestDate,
      deadlineAt,
      status,
    })
  }

  console.log(`Ditemukan ${rows.length} baris task untuk diimpor.`)

  if (errors.length) {
    console.error(`\n✖ ${errors.length} masalah ditemukan — tidak ada data yang ditulis:`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exitCode = 1
    return
  }

  if (!rows.length) {
    console.log('Tidak ada baris berisi data. Selesai.')
    return
  }

  if (dryRun || !explicitYes) {
    console.log('\nMode uji (dry-run). Ringkasan 10 baris pertama:')
    for (const r of rows.slice(0, 10)) {
      console.log(
        `  #${r.row} ${r.title} | ${r.projectName} / ${r.workTypeName} / ${r.requesterName} | ` +
          `${r.assigneeName ?? '(bucket)'} | ${r.priority} | ${r.estimatedHours ?? '-'}j | ` +
          `${r.requestDate} → ${r.deadlineAt.toISOString()} | ${r.status}`
      )
    }
    console.log('\nTidak ada yang ditulis. Jalankan ulang dengan --yes untuk menyimpan ke database.')
    return
  }

  await db.$transaction(
    async (tx) => {
      for (const r of rows) {
        const created = await tx.task.create({
          data: {
            title: r.title,
            description: r.description,
            projectId: r.projectId,
            // Impor massal selalu masuk Backlog; masukkan ke sprint lewat UI.
            sprintId: null,
            workTypeId: r.workTypeId,
            requesterId: r.requesterId,
            priority: r.priority,
            estimatedHours: r.estimatedHours,
            requestDate: new Date(`${r.requestDate}T00:00:00.000Z`),
            deadlineAt: r.deadlineAt,
            status: r.status,
            createdById: admin.id,
            ...(r.assigneeId ? { assignees: { create: [{ userId: r.assigneeId }] } } : {}),
            // Hierarki baru: setiap task wajib punya minimal satu subtask.
            // Karena Excel hanya punya satu judul, buat satu subtask bernama sama.
            subtasks: {
              create: [
                {
                  title: r.title.slice(0, 150),
                  assigneeId: r.assigneeId,
                  position: 0,
                },
              ],
            },
          },
        })
        await tx.activityLog.create({
          data: {
            userId: admin.id,
            action: 'task_created',
            entityType: 'task',
            entityId: created.id,
            newValue: {
              title: r.title,
              projectId: r.projectId,
              workTypeId: r.workTypeId,
              requesterId: r.requesterId,
              assigneeId: r.assigneeId,
              priority: r.priority,
              estimatedHours: r.estimatedHours,
              requestDate: r.requestDate,
              deadlineAt: r.deadlineAt,
              source: 'bulk_import',
            },
            description: `${admin.name} mengimpor task "${r.title}" (bulk Excel)`,
          },
        })
      }
    },
    { timeout: 120_000, maxWait: 15_000 }
  )

  console.log(`\n✔ ${rows.length} task berhasil diimpor ke database.`)
}

main()
  .catch((e) => {
    console.error('✖ Gagal impor:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
