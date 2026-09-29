// Kuro — pembuat template Excel untuk bulk import Task.
// Jalankan: npm run template:tasks
// Menghasilkan: templates/Template-Bulk-Task.xlsx
//
// Template berisi sheet:
//   - Task      : lembar utama yang diisi (header di baris 3)
//   - Contoh    : contoh pengisian (tidak diimpor)
//   - Referensi : daftar nilai valid (sumber dropdown)
//   - Petunjuk  : aturan & arti setiap kolom
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Muat .env sederhana (Prisma tidak memuat otomatis saat dijalankan lewat `node`).
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
  { key: 'title', header: 'Judul Task *', width: 42 },
  { key: 'description', header: 'Deskripsi', width: 48 },
  { key: 'project', header: 'Project *', width: 30 },
  { key: 'workType', header: 'Jenis Pekerjaan *', width: 20 },
  { key: 'requester', header: 'Requester *', width: 22 },
  { key: 'assignee', header: 'Assignee (Freelancer)', width: 26 },
  { key: 'priority', header: 'Prioritas', width: 13 },
  { key: 'estimatedHours', header: 'Estimasi (jam)', width: 15 },
  { key: 'requestDate', header: 'Tanggal Request *', width: 18 },
  { key: 'deadlineDate', header: 'Deadline (tanggal) *', width: 20 },
  { key: 'deadlineTime', header: 'Jam Deadline', width: 14 },
  { key: 'status', header: 'Status', width: 14 },
]

/** Baris awal data (header di baris 3, data mulai baris 4) — samakan dengan export. */
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
  s.value = 'Kuro — Keep You Inline  ·  kolom bertanda * wajib diisi'
  s.font = { size: 10, color: { argb: NOTE } }
}

async function main() {
  const [projects, workTypes, requesters, users] = await Promise.all([
    db.project.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { name: true } }),
    db.workType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { name: true } }),
    db.requester.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { name: true } }),
    db.user.findMany({
      where: { role: 'freelancer', isActive: true },
      orderBy: { name: 'asc' },
      select: { name: true, email: true },
    }),
  ])

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Kuro'
  wb.created = new Date()

  // ===== Sheet Referensi (dibuat lebih dulu agar dropdown bisa merujuk) =====
  const ref = wb.addWorksheet('Referensi', { views: [{ state: 'frozen', ySplit: 3 }] })
  addTitle(ref, 'Referensi Nilai Valid', 4)
  const refHeaders = ['Project *', 'Jenis Pekerjaan *', 'Requester *', 'Assignee (Freelancer)']
  ref.getRow(3).values = refHeaders
  styleHeaderRow(ref.getRow(3))
  ;[30, 20, 22, 34].forEach((w, i) => (ref.getColumn(i + 1).width = w))

  const label = (n, email) => (email ? `${n} — ${email}` : n)
  const maxLen = Math.max(projects.length, workTypes.length, requesters.length, users.length)
  for (let i = 0; i < Math.max(maxLen, 1); i++) {
    ref.getRow(FIRST_DATA_ROW + i).values = [
      projects[i]?.name ?? '',
      workTypes[i]?.name ?? '',
      requesters[i]?.name ?? '',
      users[i] ? label(users[i].name, users[i].email) : '',
    ]
  }
  const refLast = Math.max(FIRST_DATA_ROW + maxLen - 1, FIRST_DATA_ROW)

  // ===== Sheet Task (lembar utama) =====
  const ws = wb.addWorksheet('Task', { views: [{ state: 'frozen', ySplit: 3 }] })
  addTitle(ws, 'Bulk Import Task', COLUMNS.length)
  ws.getRow(3).values = COLUMNS.map((c) => c.header)
  styleHeaderRow(ws.getRow(3))
  COLUMNS.forEach((c, i) => (ws.getColumn(i + 1).width = c.width))

  // Format teks untuk kolom tanggal & jam agar tidak diubah otomatis oleh Excel.
  const dateCols = ['I', 'J', 'K']
  for (let r = FIRST_DATA_ROW; r <= MAX_ROWS + 3; r++) {
    for (const col of dateCols) ws.getCell(`${col}${r}`).numFmt = '@'
  }

  const dv = (range, formulae, prompt) =>
    ws.dataValidations.add(range, {
      type: 'list',
      allowBlank: true,
      formulae,
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Nilai tidak valid',
      error: prompt,
    })

  dv(`C${FIRST_DATA_ROW}:C${MAX_ROWS + 3}`, [`Referensi!$A$${FIRST_DATA_ROW}:$A$${refLast}`], 'Pilih project dari sheet Referensi.')
  dv(`D${FIRST_DATA_ROW}:D${MAX_ROWS + 3}`, [`Referensi!$B$${FIRST_DATA_ROW}:$B$${refLast}`], 'Pilih jenis pekerjaan dari sheet Referensi.')
  dv(`E${FIRST_DATA_ROW}:E${MAX_ROWS + 3}`, [`Referensi!$C$${FIRST_DATA_ROW}:$C$${refLast}`], 'Pilih requester dari sheet Referensi.')
  dv(`F${FIRST_DATA_ROW}:F${MAX_ROWS + 3}`, [`Referensi!$D$${FIRST_DATA_ROW}:$D$${refLast}`], 'Pilih freelancer dari sheet Referensi. Kosongkan untuk bucket bersama.')
  dv(`G${FIRST_DATA_ROW}:G${MAX_ROWS + 3}`, ['"low,medium,high"'], 'Pilih low / medium / high.')
  dv(`L${FIRST_DATA_ROW}:L${MAX_ROWS + 3}`, ['"todo,in_progress,review,done,cancelled"'], 'Pilih status task.')

  // Jam deadline: saran (bukan blokir) — nilai lain tetap boleh.
  ws.dataValidations.add(`K${FIRST_DATA_ROW}:K${MAX_ROWS + 3}`, {
    type: 'list',
    allowBlank: true,
    formulae: ['"09:00,10:00,12:00,14:00,16:00,17:00"'],
    showErrorMessage: false,
  })

  // Baris contoh DI sheet terpisah, bukan di lembar Task.

  // ===== Sheet Contoh =====
  const ex = wb.addWorksheet('Contoh', { views: [{ state: 'frozen', ySplit: 3 }] })
  addTitle(ex, 'Contoh Pengisian (JANGAN diisi di lembar ini)', COLUMNS.length)
  ex.getRow(3).values = COLUMNS.map((c) => c.header)
  styleHeaderRow(ex.getRow(3))
  COLUMNS.forEach((c, i) => (ex.getColumn(i + 1).width = c.width))
  ex.getRow(4).values = [
    'Redesign halaman pricing',
    'Perbaiki layout hero dan tambah section FAQ.',
    projects[0]?.name ?? 'Nama Project',
    workTypes[0]?.name ?? 'Desain',
    requesters[0]?.name ?? 'Klien Utama',
    users[0] ? label(users[0].name, users[0].email) : '(kosongkan = bucket bersama)',
    'high',
    6.5,
    '2026-10-01',
    '2026-10-08',
    '17:00',
    'todo',
  ]
  ex.getRow(5).values = [
    'Riset kompetitor',
    'Cukup isi 1 baris per task. Deskripsi opsional.',
    projects[0]?.name ?? 'Nama Project',
    workTypes[0]?.name ?? 'Konten',
    requesters[0]?.name ?? 'Klien Utama',
    '',
    'medium',
    3,
    '2026-10-02',
    '2026-10-10',
    '',
    'todo',
  ]
  for (let r = 4; r <= 5; r++) {
    for (const col of dateCols) ex.getCell(`${col}${r}`).numFmt = '@'
    ex.getRow(r).alignment = { vertical: 'top' }
  }

  // ===== Sheet Petunjuk =====
  const guide = wb.addWorksheet('Petunjuk')
  guide.getColumn(1).width = 26
  guide.getColumn(2).width = 90
  addTitle(guide, 'Petunjuk Pengisian', 2)
  const rows = [
    ['Cara pakai', 'Isi HANYA lembar "Task" mulai baris 4. Satu baris = satu task. Hapus baris yang tidak dipakai (jangan sisakan baris kosong di tengah).'],
    ['Nilai valid', 'Kolom Project/Jenis Pekerjaan/Requester/Assignee punya dropdown dari sheet "Referensi". Gunakan persis nilai di sana.'],
    ['Judul Task *', 'Wajib. Minimal 3 karakter, maksimal 120 karakter.'],
    ['Deskripsi', 'Opsional. Teks biasa/HTML sederhana (akan disanitasi).'],
    ['Project *', 'Wajib. Harus project yang ada & aktif.'],
    ['Jenis Pekerjaan *', 'Wajib. Harus jenis pekerjaan yang ada & aktif.'],
    ['Requester *', 'Wajib. Harus requester yang ada & aktif.'],
    ['Assignee', 'Opsional. Kosongkan = task masuk bucket bersama (belum di-assign). Boleh nama, atau "Nama — email". Hanya freelancer aktif.'],
    ['Prioritas', 'low / medium / high. Kosong = medium.'],
    ['Estimasi (jam)', 'Opsional. Angka > 0, maksimal 500, kelipatan 0,5 (contoh 0,5 / 1 / 2,5 / 6,5).'],
    ['Tanggal Request *', 'Wajib. Format YYYY-MM-DD (contoh 2026-10-01).'],
    ['Deadline (tanggal) *', 'Wajib. Format YYYY-MM-DD.'],
    ['Jam Deadline', 'Opsional. Format HH:MM 24 jam (contoh 17:00). Kosong = 17:00 WIB.'],
    ['Status', 'todo / in_progress / review / done / cancelled. Kosong = todo.'],
    ['Zona waktu', 'Semua tanggal & jam dianggap WIB (Asia/Jakarta).'],
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
  const outPath = join(outDir, 'Template-Bulk-Task.xlsx')
  await wb.xlsx.writeFile(outPath)

  console.log(`✔ Template dibuat: ${outPath}`)
  console.log(`  Project       : ${projects.map((p) => p.name).join(', ') || '(kosong)'}`)
  console.log(`  Jenis Pekerjaan: ${workTypes.map((p) => p.name).join(', ') || '(kosong)'}`)
  console.log(`  Requester     : ${requesters.map((p) => p.name).join(', ') || '(kosong)'}`)
  console.log(`  Freelancer    : ${users.map((u) => u.name).join(', ') || '(kosong)'}`)
}

main()
  .catch((e) => {
    console.error('✖ Gagal membuat template:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
