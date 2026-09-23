// GET /api/dashboard/summary — total jam hari/minggu/bulan per freelancer,
// jumlah task per status, daftar overdue
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { getDashboardSummary } from '@/lib/dashboard'

export async function GET() {
  const { error } = await requireApiUser(['admin'])
  if (error) return error

  const summary = await getDashboardSummary()
  return NextResponse.json(summary)
}
