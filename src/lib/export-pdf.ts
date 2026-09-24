// Kuro — export PDF laporan bulanan (Fase 5 / F5)
// Template HTML di-render server-side lalu dicetak ke PDF via Puppeteer (chromium sistem).
// Dokumen hanya boleh memuat konten dari DB (bukan input mentah user) — nilai di-escape.
import { existsSync } from 'fs'
import { formatDateWIB, formatMinutes, formatWIB, periodLabel } from './time'
import type { ReportResponse, ReportUser } from './reports'

/** Lokasi umum browser headless (dipakai bila env tidak diset — mis. saat dev lokal) */
const BROWSER_CANDIDATES: Record<string, string[]> = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome'],
}

/** Tentukan executable Chromium: env dulu (bila ada), lalu lokasi umum sesuai platform */
function resolveExecutablePath(): string | undefined {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const candidates = BROWSER_CANDIDATES[process.platform] ?? []
  return candidates.find((p) => existsSync(p))
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function userBlock(u: ReportUser): string {
  const rows = u.byDay
    .map((d) => {
      const dayLabel = formatDateWIB(`${d.date}T00:00:00Z`)
      const taskLines = d.entries
        .map(
          (e) => `<tr>
            <td>${escapeHtml(e.taskTitle)}</td>
            <td>${escapeHtml(e.project)}</td>
            <td>${escapeHtml(e.workType)}</td>
            <td class="num">${formatWIB(e.clockInAt, 'HH.mm')}</td>
            <td class="num">${formatWIB(e.clockOutAt, 'HH.mm')}</td>
            <td class="num">${e.minutes}</td>
          </tr>`
        )
        .join('')
      return `<tr class="day-head">
          <td colspan="6"><strong>${escapeHtml(dayLabel)}</strong> — ${formatMinutes(d.minutes)} (${d.entryCount} sesi)</td>
        </tr>${taskLines}`
    })
    .join('')

  const projectRows = u.byProject
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.project)}</td><td class="num">${formatMinutes(p.minutes)}</td><td class="num">${p.minutes}</td></tr>`
    )
    .join('')

  const workTypeRows = u.byWorkType
    .map(
      (w) =>
        `<tr><td>${escapeHtml(w.workType)}</td><td class="num">${formatMinutes(w.minutes)}</td><td class="num">${w.minutes}</td></tr>`
    )
    .join('')

  return `<section class="user">
    <header class="user-head">
      <div>
        <h2>${escapeHtml(u.name)}</h2>
        <p class="muted">${escapeHtml(u.email)}</p>
      </div>
      <div class="totals">
        <div><span class="k">Total jam</span><span class="v">${formatMinutes(u.totalMinutes)}</span></div>
        <div><span class="k">Hari kerja</span><span class="v">${u.workDays}</span></div>
        <div><span class="k">Sesi</span><span class="v">${u.entryCount}</span></div>
      </div>
    </header>

    <h3>Rincian per Hari & Task</h3>
    ${
      u.byDay.length === 0
        ? '<p class="empty">Tidak ada catatan jam kerja pada periode ini.</p>'
        : `<table>
      <thead><tr><th>Task</th><th>Project</th><th>Jenis</th><th class="num">In</th><th class="num">Out</th><th class="num">Menit</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
    }

    <div class="two-col">
      <div>
        <h3>Per Project</h3>
        ${
          projectRows
            ? `<table><thead><tr><th>Project</th><th class="num">Durasi</th><th class="num">Menit</th></tr></thead><tbody>${projectRows}</tbody></table>`
            : '<p class="empty">—</p>'
        }
      </div>
      <div>
        <h3>Per Jenis Pekerjaan</h3>
        ${
          workTypeRows
            ? `<table><thead><tr><th>Jenis</th><th class="num">Durasi</th><th class="num">Menit</th></tr></thead><tbody>${workTypeRows}</tbody></table>`
            : '<p class="empty">—</p>'
        }
      </div>
    </div>
  </section>`
}

/** HTML lengkap laporan bulanan (satu bagian per freelancer) */
export function buildReportHtml(report: ReportResponse): string {
  const label = periodLabel(report.period.year, report.period.month)
  const generated = formatWIB(new Date())

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #17161D; margin: 0; font-size: 11px; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #8B2FF2; }
  h2 { font-size: 15px; margin: 0 0 2px; }
  h3 { font-size: 12px; margin: 14px 0 6px; color: #3F3E47; }
  .muted { color: #9291A0; margin: 0; }
  .cover { padding: 24px 0 12px; border-bottom: 2px solid #8B2FF2; margin-bottom: 16px; }
  .cover .meta { margin-top: 8px; font-size: 11px; color: #6F6E78; }
  .user { page-break-inside: avoid; padding: 16px 0; border-bottom: 1px solid #E9E8EE; }
  .user-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .totals { display: flex; gap: 18px; }
  .totals .k { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #9291A0; }
  .totals .v { display: block; font-size: 16px; font-weight: 800; color: #8B2FF2; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { background: #F4ECFF; color: #6C1BC9; text-align: left; padding: 6px 8px; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #F0EFF4; vertical-align: top; }
  tr.day-head td { background: #FAFAFB; font-size: 10px; }
  .num { text-align: right; }
  .empty { color: #9291A0; }
  .two-col { display: flex; gap: 16px; }
  .two-col > div { flex: 1; }
  footer { margin-top: 18px; font-size: 9px; color: #9291A0; text-align: center; }
</style>
</head>
<body>
  <div class="cover">
    <h1>Kuro — Rekap Jam Kerja</h1>
    <p class="muted">Periode ${escapeHtml(label)} · ${escapeHtml(report.range.from)} s/d ${escapeHtml(report.range.to)}</p>
    <div class="meta">
      Total ${formatMinutes(report.totalMinutes)} (${report.totalMinutes} menit) · ${report.users.length} freelancer · dibuat ${escapeHtml(generated)} WIB
    </div>
  </div>
  ${report.users.map(userBlock).join('')}
  <footer>Dokumen dibuat otomatis oleh Kuro — Keep You Inline</footer>
</body>
</html>`
}

/** Render PDF dari HTML memakai browser headless (chromium sistem / env PUPPETEER_EXECUTABLE_PATH) */
export async function buildReportPdf(html: string): Promise<Buffer> {
  const puppeteer = await import('puppeteer-core')
  const executablePath = resolveExecutablePath()

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '12mm', bottom: '16mm', left: '12mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
