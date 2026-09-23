// /api/corrections — GET (daftar; freelancer hanya miliknya — rule #12) & POST (ajukan, freelancer)
import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { findCorrection, hasPendingCorrection, listCorrections } from '@/lib/corrections'
import { TIME_ENTRY_INCLUDE, mapTimeEntry } from '@/lib/time-entries'
import { wibLocalToDate } from '@/lib/time'
import { correctionCreateSchema } from '@/lib/validators'

const STATUSES = ['pending', 'approved', 'rejected'] as const

export async function GET(req: Request) {
  const { user, error } = await requireApiUser()
  if (error) return error

  const sp = new URL(req.url).searchParams
  const where: Prisma.CorrectionRequestWhereInput = {}

  // Rule #12: scope di API, bukan hanya UI
  if (user.role === 'freelancer') where.requestedById = user.id

  const status = sp.get('status')
  if (status && status !== 'all' && (STATUSES as readonly string[]).includes(status)) {
    where.status = status as (typeof STATUSES)[number]
  }

  const items = await listCorrections(where)
  const pending = items.filter((c) => c.status === 'pending').length
  return NextResponse.json({ corrections: items, pending })
}

export async function POST(req: Request) {
  const { user, error } = await requireApiUser(['freelancer'])
  if (error) return error

  const parsed = await parseJson(req, correctionCreateSchema)
  if (parsed.error) return parsed.error
  const { timeEntryId, newClockInLocal, newClockOutLocal, newTaskId, reason } = parsed.data

  const entry = await db.timeEntry.findUnique({
    where: { id: timeEntryId },
    include: TIME_ENTRY_INCLUDE,
  })
  if (!entry) return NextResponse.json({ error: 'Time entry tidak ditemukan.' }, { status: 404 })

  // Rule #12: hanya boleh mengajukan koreksi untuk entri sendiri
  if (entry.userId !== user.id) {
    return NextResponse.json({ error: 'Anda hanya bisa mengoreksi jam kerja sendiri.' }, { status: 403 })
  }

  // Hindari antrean ganda: satu koreksi pending per entri
  if (await hasPendingCorrection(timeEntryId)) {
    return NextResponse.json(
      { error: 'Sudah ada pengajuan koreksi yang menunggu review untuk sesi ini.' },
      { status: 409 }
    )
  }

  const newClockInAt = newClockInLocal ? wibLocalToDate(newClockInLocal) : null
  const newClockOutAt = newClockOutLocal ? wibLocalToDate(newClockOutLocal) : null

  // Usulan yang sama dengan nilai sekarang tidak ada gunanya
  const changed =
    (newClockInAt && newClockInAt.getTime() !== entry.clockInAt.getTime()) ||
    (newClockOutAt &&
      newClockOutAt.getTime() !== (entry.clockOutAt?.getTime() ?? Number.NaN)) ||
    (newTaskId && newTaskId !== entry.taskId)
  if (!changed) {
    return NextResponse.json(
      { error: 'Usulan koreksi sama dengan nilai saat ini.' },
      { status: 400 }
    )
  }

  if (newTaskId) {
    const task = await db.task.findUnique({ where: { id: newTaskId }, select: { id: true } })
    if (!task) return NextResponse.json({ error: 'Task usulan tidak ditemukan.' }, { status: 400 })
  }

  const created = await db.correctionRequest.create({
    data: {
      timeEntryId,
      requestedById: user.id,
      newClockInAt,
      newClockOutAt,
      newTaskId: newTaskId || null,
      reason,
    },
  })

  const after = await findCorrection(created.id)

  await logActivity({
    userId: user.id,
    action: 'correction_submitted',
    entityType: 'correction',
    entityId: created.id,
    oldValue: {
      clockInAt: entry.clockInAt,
      clockOutAt: entry.clockOutAt,
      taskId: entry.taskId,
      taskTitle: entry.task.title,
    },
    newValue: { newClockInAt, newClockOutAt, newTaskId: newTaskId || null, reason },
    description: `${user.name} mengajukan koreksi untuk task "${entry.task.title}" — ${reason}`,
  })

  return NextResponse.json(
    { correction: after ? mapTimeEntryAndCorrection(after) : null },
    { status: 201 }
  )
}

// Helper kecil: bentuk ringkas untuk response POST
function mapTimeEntryAndCorrection(c: NonNullable<Awaited<ReturnType<typeof findCorrection>>>) {
  return {
    id: c.id,
    status: c.status,
    timeEntry: mapTimeEntry(c.timeEntry),
  }
}
