// POST /api/corrections/:id/approve — setujui koreksi (admin).
// Menerapkan usulan ke time entry dalam transaksi, memvalidasi rule #2, #11, tumpang tindih.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { requireApiUser } from '@/lib/auth'
import { validateEntryChange } from '@/lib/corrections'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(['admin'])
  if (error) return error

  const correction = await db.correctionRequest.findUnique({
    where: { id: params.id },
    include: {
      timeEntry: { include: { task: { select: { id: true, title: true } } } },
    },
  })
  if (!correction) return NextResponse.json({ error: 'Koreksi tidak ditemukan.' }, { status: 404 })
  if (correction.status !== 'pending') {
    return NextResponse.json({ error: 'Koreksi ini sudah direview.' }, { status: 409 })
  }

  const entry = correction.timeEntry
  // null/undefined pada usulan berarti "tidak diubah"
  const nextClockIn = correction.newClockInAt ?? entry.clockInAt
  const nextClockOut = correction.newClockOutAt ?? entry.clockOutAt
  const nextTaskId = correction.newTaskId ?? entry.taskId

  // Validasi ulang semua business rule sebelum menerapkan (RANCANGAN §4.5)
  const invalid = await validateEntryChange({
    userId: entry.userId,
    entryId: entry.id,
    clockInAt: nextClockIn,
    clockOutAt: nextClockOut,
    taskId: nextTaskId !== entry.taskId ? nextTaskId : undefined,
  })
  if (invalid) {
    return NextResponse.json({ error: invalid.message }, { status: invalid.status })
  }

  const now = new Date()
  const taskChanged = nextTaskId !== entry.taskId
  let newTaskTitle: string | null = null
  if (taskChanged) {
    const t = await db.task.findUnique({ where: { id: nextTaskId }, select: { title: true } })
    newTaskTitle = t?.title ?? null
  }

  await db.$transaction([
    db.timeEntry.update({
      where: { id: entry.id },
      data: { clockInAt: nextClockIn, clockOutAt: nextClockOut, taskId: nextTaskId },
    }),
    db.correctionRequest.update({
      where: { id: correction.id },
      data: { status: 'approved', reviewedById: admin.id, reviewedAt: now },
    }),
  ])

  await logActivity({
    userId: admin.id,
    action: 'correction_approved',
    entityType: 'correction',
    entityId: correction.id,
    oldValue: {
      clockInAt: entry.clockInAt,
      clockOutAt: entry.clockOutAt,
      taskId: entry.taskId,
      taskTitle: entry.task.title,
    },
    newValue: {
      clockInAt: nextClockIn,
      clockOutAt: nextClockOut,
      taskId: nextTaskId,
      taskTitle: newTaskTitle ?? entry.task.title,
    },
    description: `${admin.name} menyetujui koreksi jam kerja task "${entry.task.title}"${
      taskChanged ? ` → "${newTaskTitle}"` : ''
    }`,
  })

  return NextResponse.json({ ok: true, status: 'approved' })
}
