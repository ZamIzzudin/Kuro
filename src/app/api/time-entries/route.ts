// GET /api/time-entries — riwayat time entry (rule #12: freelancer hanya miliknya; admin semua)
// Filter: from/to (yyyy-MM-dd, WIB), subtaskId, userId (admin saja), active=true
import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { TIME_ENTRY_INCLUDE, mapTimeEntry } from '@/lib/time-entries'
import { wibLocalToDate } from '@/lib/time'

export async function GET(req: Request) {
  // Rekap-style data: Admin (semua) & freelancer (miliknya). Project Manager tidak.
  const { user, error } = await requireApiUser(['admin', 'freelancer'])
  if (error) return error

  const sp = new URL(req.url).searchParams
  const where: Prisma.TimeEntryWhereInput = {}

  // Rule #12: scope data di API, bukan hanya UI
  if (user.role === 'freelancer') {
    where.userId = user.id
  } else {
    const userId = sp.get('userId')
    if (userId && userId !== 'all') where.userId = userId
  }

  const subtaskId = sp.get('subtaskId')
  if (subtaskId) where.subtaskId = subtaskId

  if (sp.get('active') === 'true') where.clockOutAt = null

  const from = sp.get('from')
  const to = sp.get('to')
  if (from || to) {
    where.clockInAt = {}
    if (from) where.clockInAt.gte = wibLocalToDate(`${from}T00:00`)
    if (to) where.clockInAt.lte = wibLocalToDate(`${to}T23:59`)
  }

  const entries = await db.timeEntry.findMany({
    where,
    include: TIME_ENTRY_INCLUDE,
    orderBy: { clockInAt: 'desc' },
    take: 300,
  })

  const now = new Date()
  const items = entries.map((e) => mapTimeEntry(e, now))
  const totalMinutes = items.reduce((sum, e) => sum + (e.active ? 0 : e.minutes), 0)

  return NextResponse.json({
    entries: items,
    totalMinutes,
    /** jumlah hari unik dengan entry (Q7) */
    workDays: new Set(items.map((e) => e.clockInAt.slice(0, 10))).size,
  })
}
