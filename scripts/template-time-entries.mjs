// Kuro — pembuat template Excel untuk bulk import Time Entry (backdate / suntik data).
// Jalankan: npm run template:time-entries
// Menghasilkan: templates/Template-Bulk-TimeEntry.xlsx
//
// Sheet:
//   - TimeEntry    : lembar utama yang diisi (header di baris 3)
//   - Contoh       : contoh pengisian
//   - Referensi    : daftar freelancer & project (sumber dropdown)
//   - Daftar Subtask: daftar subtask yang ada (ID, project, judul task induk, judul subtask, status)
//   - Petunjuk     : aturan & arti tiap kolom
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const envPath = join(root, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

const BRAND = 'FF8B2FF2'
const HEAD_FILL = 'FFF4ECFF'
const HEAD_TEXT = 'FF6C1BC9'
const NOTE = 'FF9291A0'

const db = new PrismaClient()

const COLUMNS = [
  { key: 'user', header: 'Freelancer *', width: 30 },
  { key: 'project', header: 'Project *', width: 30 },
  { key: 'task', header: 'Judul Subtask/Task *', width: 40 },
  { key: 'inDate', header: 'Tanggal Masuk *', width: 18 },
  { key: 'inTime', header: 'Jam Masuk *', width: 14 },
  { key: 'outDate', header: 'Tanggal Keluar', width: 18 },
  { key: 'outTime', header: 'Jam Keluar *', width: 14 },
  { key: 'note', header: 'Catatan', width: 46 },
]

const FIRST_DATA_ROW = 4
const MAX_ROWS = 500

function styleHeaderRow(row) {
  row.height = 30
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: HEAD_TEXT } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } }
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE9E8EE' } } }
  })
}

function addTitle(ws, title, span) {
  ws.mergeCells(1, 1, 1, span)
  const t = ws.getCell(1, 1)
  t.value = title
  t.font = { bold: true, size: 14, color: { argb: BRAND } }
  ws.mergeCells(2, 1, 2, span)
  const s = ws.getCell(2, 1)
  s.value = 'Kuro — Keep You Inline  ·  kolom bertanda * wajib diisi  ·  semua waktu WIB'
  s.font = { size: 10, color: { argb: NOTE } }
}

async function main() {
  const [projects, freelancers, tasks] = await Promise.all([
    db.project.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { name: true } }),
    db.user.findMany({
      where: { role: 'freelancer' },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { name: true, email: true, isActive: true },
    }),
    db.subtask.findMany({
      where: { task: { status: { not: 'cancelled' } } },
      orderBy: [{ task: { project: { name: 'asc' } } }, { title: 'asc' }],
      select: {
        id: true,
        title: true,
        status: true,
        task: { select: { title: true, project: { select: { name: true } } } },
      },
    }),
  ])

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Kuro'
  wb.created = new Date()

  const label = (f) => `${f.name} — ${f.email}${f.isActive ? '' : ' (nonaktif)'}`

  // ===== Referensi (sumber dropdown) =====
  const ref = wb.addWorksheet('Referensi', { views: [{ state: 'frozen', ySplit: 3 }] })
  addTitle(ref, 'Referensi Nilai Valid', 2)
  ref.getRow(3).values = ['Freelancer *', 'Project *']
  styleHeaderRow(ref.getRow(3))
  ref.getColumn(1).width = 38
  ref.getColumn(2).width = 30
  const maxLen = Math.max(freelancers.length, projects.length, 1)
  for (let i = 0; i < maxLen; i++) {
    ref.getRow(FIRST_DATA_ROW + i).values = [
      freelancers[i] ? label(freelancers[i]) : '',
      projects[i]?.name ?? '',
    ]
  }
  const refLast = Math.max(FIRST_DATA_ROW + maxLen - 1, FIRST_DATA_ROW)

  // ===== TimeEntry (lembar utama) =====
  const ws = wb.addWorksheet('TimeEntry', { views: [{ state: 'frozen', ySplit: 3 }] })
  addTitle(ws, 'Bulk Import Time Entry (Backdate)', COLUMNS.length)
  ws.getRow(3).values = COLUMNS.map((c) => c.header)
  styleHeaderRow(ws.getRow(3))
  COLUMNS.forEach((c, i) => (ws.getColumn(i + 1).width = c.width))

  // Format teks agar Excel tidak mengubah tanggal/jam otomatis.
  for (const col of ['D', 'E', 'F', 'G']) {
    for (let r = FIRST_DATA_ROW; r <= MAX_ROWS + 3; r++) ws.getCell(`${col}${r}`).numFmt = '@'
  }

  const addList = (range, formulae, prompt) =>
    ws.dataValidations.add(range, {
      type: 'list',
      allowBlank: true,
      formulae,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Nilai tidak valid',
      error: prompt,
    })

  addList(`A${FIRST_DATA_ROW}:A${MAX_ROWS + 3}`, [`Referensi!$A$${FIRST_DATA_ROW}:$A$${refLast}`], 'Pilih freelancer dari sheet Referensi.')
  addList(`B${FIRST_DATA_ROW}:B${MAX_ROWS + 3}`, [`Referensi!$B$${FIRST_DATA_ROW}:$B$${refLast}`], 'Pilih project dari sheet Referensi.')

  // ===== Contoh =====
  const ex = wb.addWorksheet('Contoh', { views: [{ state: 'frozen', ySplit: 3 }] })
  addTitle(ex, 'Contoh Pengisian (JANGAN diisi di lembar ini)', COLUMNS.length)
  ex.getRow(3).values = COLUMNS.map((c) => c.header)
  styleHeaderRow(ex.getRow(3))
  COLUMNS.forEach((c, i) => (ex.getColumn(i + 1).width = c.width))
  const exProject = projects[0]?.name ?? 'Nama Project'
  const exTask = tasks[0]?.title ?? 'Judul subtask'
  ex.getRow(4).values = [
    freelancers[0] ? label(freelancers[0]) : 'Nama — email',
    exProject,
    exTask,
    '2026-09-01',
    '09:00',
    '',
    '12:30',
    'Rapat kick-off dan penyusunan rencana kerja.',
  ]
  ex.getRow(5).values = [
    freelancers[0] ? label(freelancers[0]) : 'Nama — email',
    exProject,
    exTask,
    '2026-09-01',
    '13:30',
    '',
    '17:00',
    'Lanjut pengerjaan setelah istirahat.',
  ]
  ex.getRow(6).values = [
    freelancers[0] ? label(freelancers[0]) : 'Nama — email',
    exProject,
    exTask,
    '2026-09-02',
    '20:00',
    '2026-09-03',
    '01:00',
    'Sesi lintas tengah malam (opsional pakai kolom Tanggal Keluar).',
  ]
  for (let r = 4; r <= 6; r++) {
    for (const col of ['D', 'E', 'F', 'G']) ex.getCell(`${col}${r}`).numFmt = '@'
    ex.getRow(r).alignment = { vertical: 'top' }
  }

  // ===== Daftar Subtask =====
  const dt = wb.addWorksheet('Daftar Subtask', { views: [{ state: 'frozen', ySplit: 3 }] })
  addTitle(dt, 'Daftar Subtask yang Ada', 5)
  dt.getRow(3).values = ['ID Subtask', 'Project', 'Task Induk', 'Judul Subtask', 'Status']
  styleHeaderRow(dt.getRow(3))
  ;[38, 30, 36, 40, 14].forEach((w, i) => (dt.getColumn(i + 1).width = w))
  tasks.forEach((s, i) => {
    dt.getRow(FIRST_DATA_ROW + i).values = [
      s.id,
      s.task.project.name,
      s.task.title,
      s.title,
      s.status,
    ]
  })

  // ===== Petunjuk =====
  const guide = wb.addWorksheet('Petunjuk')
  guide.getColumn(1).width = 24
  guide.getColumn(2).width = 94
  addTitle(guide, 'Petunjuk Pengisian', 2)
  const rows = [
    ['Cara pakai', 'Isi HANYA lembar "TimeEntry" mulai baris 4. Satu baris = satu sesi kerja (clock in → clock out).'],
    ['Freelancer *', 'Wajib. Pilih dari dropdown (nama — email). Boleh freelancer nonaktif untuk data lama.'],
    ['Project *', 'Wajib. Harus project yang ada & aktif. Dipakai untuk mencocokkan task.'],
    ['Judul Subtask/Task *', 'Wajib. Harus sama persis dengan judul SUBTASK di project tersebut (lihat sheet "Daftar Subtask"). Boleh juga menempelkan ID Subtask, atau judul TASK yang hanya punya satu subtask.'],
    ['Tanggal Masuk *', 'Wajib. Format YYYY-MM-DD (contoh 2026-09-01).'],
    ['Jam Masuk *', 'Wajib. Format HH:MM 24 jam (contoh 09:00).'],
    ['Tanggal Keluar', 'Opsional. Isi HANYA bila jam keluar jatuh di hari berikutnya (sesi lintas malam). Kosong = sama dengan Tanggal Masuk.'],
    ['Jam Keluar *', 'Wajib. Format HH:MM. Harus setelah Jam Masuk.'],
    ['Catatan', 'Opsional. Keterangan pekerjaan pada sesi itu.'],
    ['Zona waktu', 'Semua tanggal & jam dianggap WIB (Asia/Jakarta) dan disimpan sebagai UTC.'],
    ['Tanpa tumpang tindih', 'Sesi milik freelancer yang sama tidak boleh saling menimpa, baik dengan data lama maupun antar baris di file ini.'],
    ['Periode terkunci', 'Bila bulan (WIB) dari sesi sudah dikunci, baris itu ditolak. Buka kunci dulu bila memang perlu.'],
    ['Data ganda', 'Baris yang identik dengan sesi yang sudah ada (freelancer + subtask + jam masuk sama) otomatis dilewati.'],
    ['Efek', 'Task/subtask tidak diubah (biarkan sudah Done). Hanya jam kerja yang ditambahkan dan langsung terhitung di rekap.'],
    ['Catatan', 'Simpan file sebagai .xlsx. Setelah selesai, minta bantuan untuk diimpor ke database.'],
  ]
  rows.forEach(([k, v], i) => {
    const r = guide.getRow(FIRST_DATA_ROW + i)
    r.getCell(1).value = k
    r.getCell(1).font = { bold: true, size: 10.5, color: { argb: 'FF17161D' } }
    r.getCell(2).value = v
    r.getCell(2).font = { size: 10.5, color: { argb: 'FF52515E' } }
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
    r.height = 26
  })

  const outDir = join(root, 'templates')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'Template-Bulk-TimeEntry.xlsx')
  await wb.xlsx.writeFile(outPath)

  console.log(`✔ Template dibuat: ${outPath}`)
  console.log(`  Freelancer : ${freelancers.map((f) => f.name).join(', ') || '(kosong)'}`)
  console.log(`  Project    : ${projects.map((p) => p.name).join(', ') || '(kosong)'}`)
  console.log(`  Subtask    : ${tasks.length} subtask terdaftar (lihat sheet "Daftar Subtask")`)
}

main()
  .catch((e) => {
    console.error('✖ Gagal membuat template:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
