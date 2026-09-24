// GET /api/reports/export?year=&month=&userIds=&format=xlsx|pdf — unduh rekap bulanan (admin)
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { getReportSummary } from '@/lib/reports'
import { buildReportXlsx } from '@/lib/export-xlsx'
import { buildReportHtml, buildReportPdf } from '@/lib/export-pdf'
import { periodLabel } from '@/lib/time'
import { exportQuerySchema } from '@/lib/validators'

export async function GET(req: Request) {
  const { error } = await requireApiUser(['admin'])
  if (error) return error

  const sp = new URL(req.url).searchParams
  const parsed = exportQuerySchema.safeParse({
    year: sp.get('year'),
    month: sp.get('month'),
    userIds: sp.get('userIds') ?? undefined,
    format: sp.get('format'),
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Parameter tidak valid' },
      { status: 400 }
    )
  }

  const { year, month, userIds, format } = parsed.data
  const ids = userIds
    ? userIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []

  const report = await getReportSummary({ year, month }, ids)
  const slug = `${periodLabel(year, month).toLowerCase().replace(/\s+/g, '-')}`
  const filename = `kuro-rekap-${slug}.${format}`

  try {
    if (format === 'xlsx') {
      const buf = await buildReportXlsx(report)
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const html = buildReportHtml(report)
    const pdf = await buildReportPdf(html)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[export] gagal membuat file:', e)
    return NextResponse.json(
      { error: 'Gagal membuat file export. Coba lagi atau hubungi administrator.' },
      { status: 500 }
    )
  }
}
