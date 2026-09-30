// Kuro — pembuat template Excel untuk BULK BACKFILL: membuat task baru (backdate)
// SEKALIGUS menambahkan jam kerjanya (clock in/out) dalam satu baris.
// Jalankan: npm run template:backfill
// Menghasilkan: templates/Template-Bulk-Backfill.xlsx
//
// Satu baris = satu sesi kerja. Bila (Project + Judul Task) sama dibaris lain,
// task dibuat SEKALI lalu baris berikutnya hanya menambah sesi kerja ke task itu.
// Task baru otomatis dibuatkan SATU Subtask bernama sama (hierarki Sprint → Task → Subtask).
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
const GROUP_TASK = 'FFD9F3E4' // hijau muda: kolom data task
const GROUP_TIME = 'FFE7E1FF' // ungu muda: kolom data waktu

const db = new PrismaClient()

// group: 'task' | 'time'
const COLUMNS = [
  { header: 'Freelancer *', width: 28, group: 'time' },
  { header: 'Project *', width: 26, group: 'task' },
  { header: 'Judul Task *', width: 38, group: 'task' },
  { header: 'Deskripsi Task', width: 40, group: 'task' },
  { header: 'Jenis Pekerjaan *', width: 18, group: 'task' },
  { header: 'Requester *', width: 20, group: 'task' },
  { header: 'Prioritas', width: 12, group: 'task' },
  { header: 'Estimasi (jam)', width: 13, group: 'task' },
  { header: 'Tanggal Request', width: 15, group: 'task' },
  { header: 'Deadline (tanggal)', width: 16, group: 'task' },
  { header: 'Jam Deadline', width: 12, group: 'task' },
  { header: 'Status Task', width: 12, group: 'task' },
  { header: 'Tanggal Masuk *', width: 15, group: 'time' },
  { header: 'Jam Masuk *', width: 12, group: 'time' },
  { header: 'Tanggal Keluar', width: 15, group: 'time' },
  { header: 'Jam Keluar *', width: 12, group: 'time' },
  { header: 'Catatan Kerja', width: 40, group: 'time' },
]

const FIRST_DATA_ROW = 4
const MAX_ROWS = 500

function addTitle(ws, title, span) {
  ws.mergeCells(1, 1, 1, span)
  const t = ws.getCell(1, 1)
  t.value = title
  t.font = { bold: true, size: 14, color: { argb: BRAND } }
  ws.mergeCells(2, 1, 2, span)
  const s = ws.getCell(2, 1)
  s.value = 'Kuro — Keep You Inline  ·  kolom bertanda * wajib  ·  semua waktu WIB  ·  hijau = data task, ungu = data waktu'
  s.font = { size: 10, color: { argb: NOTE } }
}

function styleHeaderRow(row) {
  row.height = 30
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: HEAD_TEXT } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } }
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE9E8EE' } } }
  })
}

async function main() {
  const [projects, workTypes, requesters, freelancers] = await Promise.all([
    db.project.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { name: true } }),
    db.workType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { name: true } }),
    db.requester.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { name: true } }),
    db.user.findMany({
      where: { role: 'freelancer' },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { name: true, email: true, isActive: true },
    }),
  ])

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Kuro'
  wb.created = new Date()

  const label = (f) => `${f.name} — ${f.email}${f.isActive ? '' : ' (nonaktif)'}`

  // ===== Referensi =====
  const ref = wb.addWorksheet('Referensi', { views: [{ state: 'frozen', ySplit: 3 }] })
  addTitle(ref, 'Referensi Nilai Valid', 4)
  ref.getRow(3).values = ['Freelancer *', 'Project *', 'Jenis Pekerjaan *', 'Requester *']
  styleHeaderRow(ref.getRow(3))
  ;[34, 26, 18, 20].forEach((w, i) => (ref.getColumn(i + 1).width = w))
  const maxLen = Math.max(freelancers.length, projects.length, workTypes.length, requesters.length, 1)
  for (let i = 0; i < maxLen; i++) {
    ref.getRow(FIRST_DATA_ROW + i).values = [
      freelancers[i] ? label(freelancers[i]) : '',
      projects[i]?.name ?? '',
      workTypes[i]?.name ?? '',
      requesters[i]?.name ?? '',
    ]
  }
  const refLast = Math.max(FIRST_DATA_ROW + maxLen - 1, FIRST_DATA_ROW)

  // ===== Backfill (lembar utama) =====
  const ws = wb.addWorksheet('Backfill', { views: [{ state: 'frozen', ySplit: 3 }] })
  addTitle(ws, 'Bulk Backfill — Task Baru + Jam Kerja (Backdate)', COLUMNS.length)
  ws.getRow(3).values = COLUMNS.map((c) => c.header)
  styleHeaderRow(ws.getRow(3))
  COLUMNS.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width
    ws.getCell(3, i + 1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: c.group === 'task' ? GROUP_TASK : GROUP_TIME },
    }
  })

  const dateTimeCols = ['I', 'J', 'K', 'M', 'N', 'O', 'P']
  for (const col of dateTimeCols) {
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
  addList(`E${FIRST_DATA_ROW}:E${MAX_ROWS + 3}`, [`Referensi!$C$${FIRST_DATA_ROW}:$C$${refLast}`], 'Pilih jenis pekerjaan dari sheet Referensi.')
  addList(`F${FIRST_DATA_ROW}:F${MAX_ROWS + 3}`, [`Referensi!$D$${FIRST_DATA_ROW}:$D$${refLast}`], 'Pilih requester dari sheet Referensi.')
  addList(`G${FIRST_DATA_ROW}:G${MAX_ROWS + 3}`, ['"low,medium,high"'], 'low / medium / high.')
  addList(`L${FIRST_DATA_ROW}:L${MAX_ROWS + 3}`, ['"todo,in_progress,review,done,cancelled"'], 'Status task.')

  // ===== Contoh =====
  const ex = wb.addWorksheet('Contoh', { views: [{ state: 'frozen', ySplit: 3 }] })
  addTitle(ex, 'Contoh Pengisian (JANGAN diisi di lembar ini)', COLUMNS.length)
  ex.getRow(3).values = COLUMNS.map((c) => c.header)
  styleHeaderRow(ex.getRow(3))
  COLUMNS.forEach((c, i) => (ex.getColumn(i + 1).width = c.width))
  const U = freelancers[0] ? label(freelancers[0]) : 'Nama — email'
  const P = projects[0]?.name ?? 'Nama Project'
  const WT = workTypes[0]?.name ?? 'Desain'
  const RQ = requesters[0]?.name ?? 'Klien Utama'
  // Baris 1: task 1, sesi 1 (data task lengkap)
  ex.getRow(4).values = [
    U, P, 'Migrasi data pelanggan lama', 'Pindahkan data pelanggan dari spreadsheet lama ke sistem baru.',
    WT, RQ, 'high', 12, '2026-08-01', '2026-08-20', '17:00', 'done',
    '2026-08-05', '09:00', '', '12:00', 'Persiapan & pemetaan kolom.',
  ]
  // Baris 2: task 1, sesi 2 → kolom task dikosongkan (task sudah dibuat di baris 1)
  ex.getRow(5).values = [
    U, P, 'Migrasi data pelanggan lama', '', '', '', '', '', '', '', '', '',
    '2026-08-05', '13:00', '', '17:00', 'Eksekusi migrasi batch 1.',
  ]
  // Baris 3: task 2, sesi lintas tengah malam
  ex.getRow(6).values = [
    U, P, 'Bersihkan data duplikat', 'Hapus dan gabungkan data duplikat.',
    WT, RQ, 'medium', 6, '2026-08-06', '2026-08-25', '', 'done',
    '2026-08-06', '20:00', '2026-08-07', '01:30', 'Sesi malam (lintas tengah malam).',
  ]
  for (let r = 4; r <= 6; r++) {
    for (const col of dateTimeCols) ex.getCell(`${col}${r}`).numFmt = '@'
    ex.getRow(r).alignment = { vertical: 'top' }
  }

  // ===== Petunjuk =====
  const guide = wb.addWorksheet('Petunjuk')
  guide.getColumn(1).width = 26
  guide.getColumn(2).width = 96
  addTitle(guide, 'Petunjuk Pengisian', 2)
  const rows = [
    ['Cara pakai', 'Isi HANYA lembar "Backfill" mulai baris 4. Satu baris = satu sesi kerja. Kolom hijau = data task, kolom ungu = data waktu.'],
    ['Task dibuat sekali', 'Bila (Project + Judul Task) sama pada beberapa baris, task dibuat SEKALI. Baris berikutnya cukup mengulang judulnya; kolom data task boleh dikosongkan. Setiap task baru otomatis dibuatkan satu SUBTASK bernama sama sebagai unit kerja.'],
    ['Freelancer *', 'Wajib. Pilih dari dropdown. Dipakai untuk sesi kerja (siapa yang mengerjakan).'],
    ['Project *', 'Wajib. Project yang ada & aktif.'],
    ['Judul Task *', 'Wajib. Judul task (3–120 karakter). Menentukan pencocokan/gabung task.'],
    ['Deskripsi Task', 'Opsional. Teks biasa (tanpa HTML).'],
    ['Jenis Pekerjaan *', 'Wajib pada baris pertama task. Harus jenis pekerjaan aktif.'],
    ['Requester *', 'Wajib pada baris pertama task. Harus requester aktif.'],
    ['Prioritas', 'low / medium / high. Kosong = medium.'],
    ['Estimasi (jam)', 'Opsional. Angka > 0, maks 500, kelipatan 0,5.'],
    ['Tanggal Request', 'Opsional. YYYY-MM-DD. Kosong = mengikuti Tanggal Masuk.'],
    ['Deadline (tanggal)', 'Opsional. YYYY-MM-DD. Kosong = Tanggal Request + 7 hari.'],
    ['Jam Deadline', 'Opsional. HH:MM. Kosong = 17:00 WIB.'],
    ['Status Task', 'todo / in_progress / review / done / cancelled. Kosong = done (karena data lama).'],
    ['Tanggal Masuk *', 'Wajib. YYYY-MM-DD — tanggal mulai sesi kerja.'],
    ['Jam Masuk *', 'Wajib. HH:MM.'],
    ['Tanggal Keluar', 'Opsional. Isi HANYA bila sesi melewati tengah malam.'],
    ['Jam Keluar *', 'Wajib. HH:MM, harus setelah Jam Masuk.'],
    ['Catatan Kerja', 'Opsional. Disimpan sebagai catatan time entry.'],
    ['Status akhir sesi', 'Otomatis memakai "Status Task" pada task tersebut.'],
    ['Task yang sudah ada', 'Bila task dengan project + judul yang sama sudah ada di sistem, task itu DIPAKAI ulang (tidak diduplikasi, tidak diubah).'],
    ['Tanpa tumpang tindih', 'Sesi milik freelancer yang sama tidak boleh saling menimpa (termasuk dengan data lama).'],
    ['Periode terkunci', 'Bila bulan (WIB) sesi sudah dikunci, baris itu ditolak.'],
    ['Zona waktu', 'Semua tanggal & jam dianggap WIB (Asia/Jakarta) dan disimpan UTC.'],
    ['Catatan', 'Simpan sebagai .xlsx, lalu minta bantuan untuk diimpor ke database.'],
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
  const outPath = join(outDir, 'Template-Bulk-Backfill.xlsx')
  await wb.xlsx.writeFile(outPath)

  console.log(`✔ Template dibuat: ${outPath}`)
  console.log(`  Freelancer : ${freelancers.map((f) => f.name).join(', ') || '(kosong)'}`)
  console.log(`  Project    : ${projects.map((p) => p.name).join(', ') || '(kosong)'}`)
  console.log(`  Jenis Kerja: ${workTypes.map((w) => w.name).join(', ') || '(kosong)'}`)
  console.log(`  Requester  : ${requesters.map((r) => r.name).join(', ') || '(kosong)'}`)
}

main()
  .catch((e) => {
    console.error('✖ Gagal membuat template:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
