// /api/period-locks — GET (daftar periode terkunci) & POST (kunci periode baru) — admin only
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson, prismaError } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { listPeriodLocks } from '@/lib/reports'
import { periodLabel } from '@/lib/time'
import { periodLockCreateSchema } from '@/lib/validators'

export async function GET() {
  const { error } = await requireApiUser(['admin'])
  if (error) return error

  const locks = await listPeriodLocks()
  return NextResponse.json({ locks })
}

export async function POST(req: Request) {
  const { user: admin, error } = await requireApiUser(['admin'])
  if (error) return error

  const parsed = await parseJson(req, periodLockCreateSchema)
  if (parsed.error) return parsed.error
  const { year, month, note } = parsed.data

  try {
    const lock = await db.periodLock.create({
      data: { year, month, note: note || null, lockedById: admin.id },
      include: { lockedBy: { select: { id: true, name: true } } },
    })

    const label = periodLabel(year, month)
    await logActivity({
      userId: admin.id,
      action: 'period_locked',
      entityType: 'period_lock',
      entityId: lock.id,
      newValue: { year, month, note: lock.note },
      description: `${admin.name} mengunci periode ${label}`,
    })

    return NextResponse.json(
      {
        lock: {
          id: lock.id,
          year: lock.year,
          month: lock.month,
          note: lock.note,
          lockedAt: lock.lockedAt.toISOString(),
          lockedBy: { id: lock.lockedBy.id, name: lock.lockedBy.name },
        },
      },
      { status: 201 }
    )
  } catch (e) {
    const res = prismaError(e)
    if (res) return res
    throw e
  }
}
