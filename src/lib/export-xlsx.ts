// Kuro — export XLSX rekap bulanan (Fase 5 / F5)
// Sheet: Ringkasan (per freelancer) + Rincian (per hari/per task) + Per Project + Per Jenis Pekerjaan.
import ExcelJS from 'exceljs'
import { formatWIB, formatMinutes, periodLabel } from './time'
import type { ReportResponse } from './reports'

const BRAND = 'FF8B2FF2'
const HEAD_FILL = 'FFF4ECFF'
const HEAD_TEXT = 'FF6C1BC9'

type Col = { header: string; width: number }
type Cell = string | number

function styleHeader(row: ExcelJS.Row) {
  row.height = 22
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: HEAD_TEXT } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE9E8EE' } } }
  })
}

function addSheet(wb: ExcelJS.Workbook, name: string, title: string, cols: Col[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })

  ws.mergeCells(1, 1, 1, cols.length)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = title
  titleCell.font = { bold: true, size: 14, color: { argb: BRAND } }

  ws.mergeCells(2, 1, 2, cols.length)
  const sub = ws.getCell(2, 1)
  sub.value = 'Kuro — Keep You Inline'
  sub.font = { size: 10, color: { argb: 'FF9291A0' } }

  ws.addRow(cols.map((c) => c.header))
  styleHeader(ws.getRow(3))
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width
  })
  return ws
}

function pushRows(ws: ExcelJS.Worksheet, rows: Cell[][]) {
  for (const cells of rows) ws.addRow(cells)
}

/** Bangun buffer XLSX dari hasil rekap */
export async function buildReportXlsx(report: ReportResponse): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Kuro'
  wb.created = new Date()
  const label = periodLabel(report.period.year, report.period.month)

  // ===== Sheet 1: Ringkasan per freelancer =====
  const summary = addSheet(wb, 'Ringkasan', `Rekap Jam Kerja — ${label}`, [
    { header: 'No', width: 6 },
    { header: 'Freelancer', width: 26 },
    { header: 'Email', width: 30 },
    { header: 'Total Jam', width: 14 },
    { header: 'Total Menit', width: 14 },
    { header: 'Hari Kerja', width: 12 },
    { header: 'Jumlah Sesi', width: 12 },
  ])
  pushRows(
    summary,
    report.users.map((u, i) => [
      i + 1,
      u.name,
      u.email,
      formatMinutes(u.totalMinutes),
      u.totalMinutes,
      u.workDays,
      u.entryCount,
    ])
  )
  summary.addRow([])
  const totalRow = summary.addRow([
    '',
    'TOTAL',
    '',
    formatMinutes(report.totalMinutes),
    report.totalMinutes,
    report.users.reduce((s, u) => s + u.workDays, 0),
    report.users.reduce((s, u) => s + u.entryCount, 0),
  ])
  totalRow.font = { bold: true }

  // ===== Sheet 2: Rincian per hari & task =====
  const detail = addSheet(wb, 'Rincian', `Rincian Harian & Per Task — ${label}`, [
    { header: 'Freelancer', width: 22 },
    { header: 'Tanggal', width: 14 },
    { header: 'Task', width: 34 },
    { header: 'Project', width: 22 },
    { header: 'Jenis Pekerjaan', width: 20 },
    { header: 'Requester', width: 20 },
    { header: 'Clock In', width: 18 },
    { header: 'Clock Out', width: 18 },
    { header: 'Menit', width: 10 },
    { header: 'Catatan', width: 40 },
  ])
  const detailRows: Cell[][] = []
  for (const u of report.users) {
    for (const e of u.entries) {
      detailRows.push([
        u.name,
        formatWIB(e.clockInAt, 'dd MMM yyyy'),
        e.taskTitle,
        e.project,
        e.workType,
        e.requester,
        formatWIB(e.clockInAt, 'dd MMM yyyy HH.mm'),
        formatWIB(e.clockOutAt, 'dd MMM yyyy HH.mm'),
        e.minutes,
        e.note ?? '',
      ])
    }
  }
  pushRows(detail, detailRows)

  // ===== Sheet 3: Per project =====
  const byProject = addSheet(wb, 'Per Project', `Rekap per Project — ${label}`, [
    { header: 'Freelancer', width: 24 },
    { header: 'Project', width: 30 },
    { header: 'Total Jam', width: 14 },
    { header: 'Menit', width: 12 },
  ])
  const projectRows: Cell[][] = []
  for (const u of report.users) {
    for (const p of u.byProject) {
      projectRows.push([u.name, p.project, formatMinutes(p.minutes), p.minutes])
    }
  }
  pushRows(byProject, projectRows)

  // ===== Sheet 4: Per jenis pekerjaan =====
  const byWorkType = addSheet(wb, 'Per Jenis Pekerjaan', `Rekap per Jenis Pekerjaan — ${label}`, [
    { header: 'Freelancer', width: 24 },
    { header: 'Jenis Pekerjaan', width: 30 },
    { header: 'Total Jam', width: 14 },
    { header: 'Menit', width: 12 },
  ])
  const workTypeRows: Cell[][] = []
  for (const u of report.users) {
    for (const w of u.byWorkType) {
      workTypeRows.push([u.name, w.workType, formatMinutes(w.minutes), w.minutes])
    }
  }
  pushRows(byWorkType, workTypeRows)

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
