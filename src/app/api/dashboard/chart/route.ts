// GET /api/dashboard/chart?days=30 — jam kerja harian per user (default 30 hari)
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { getWorkChart } from '@/lib/dashboard'

export async function GET(req: Request) {
  const { error } = await requireApiUser(['admin'])
  if (error) return error

  const raw = new URL(req.url).searchParams.get('days')
  const parsed = raw ? Number(raw) : 30
  const days = Number.isFinite(parsed) ? parsed : 30

  const chart = await getWorkChart(days)
  return NextResponse.json(chart)
}
