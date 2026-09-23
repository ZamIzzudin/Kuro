// GET /api/reports/summary?year=&month=&userIds=a,b — rekap bulanan (admin)
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { getReportSummary } from '@/lib/reports'
import { wibYearMonth } from '@/lib/time'
import { reportQuerySchema } from '@/lib/validators'

export async function GET(req: Request) {
  const { error } = await requireApiUser(['admin'])
  if (error) return error

  const sp = new URL(req.url).searchParams
  const fallback = wibYearMonth(new Date())
  const parsed = reportQuerySchema.safeParse({
    year: sp.get('year') ?? fallback.year,
    month: sp.get('month') ?? fallback.month,
    userIds: sp.get('userIds') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Parameter tidak valid' },
      { status: 400 }
    )
  }

  const { year, month, userIds } = parsed.data
  const ids = userIds
    ? userIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []

  const report = await getReportSummary({ year, month }, ids)
  return NextResponse.json(report)
}
