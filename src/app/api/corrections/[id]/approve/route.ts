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
      timeEntry: { include: { subtask: { select: { id: true, title: true } } } },
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
  const nextSubtaskId = correction.newSubtaskId ?? entry.subtaskId

  // Validasi ulang semua business rule sebelum menerapkan (RANCANGAN §4.5)
  const invalid = await validateEntryChange({
    userId: entry.userId,
    entryId: entry.id,
    clockInAt: nextClockIn,
    clockOutAt: nextClockOut,
    subtaskId: nextSubtaskId !== entry.subtaskId ? nextSubtaskId : undefined,
  })
  if (invalid) {
    return NextResponse.json({ error: invalid.message }, { status: invalid.status })
  }

  const now = new Date()
  const subtaskChanged = nextSubtaskId !== entry.subtaskId
  let newSubtaskTitle: string | null = null
  if (subtaskChanged) {
    const s = await db.subtask.findUnique({ where: { id: nextSubtaskId }, select: { title: true } })
    newSubtaskTitle = s?.title ?? null
  }

  await db.$transaction([
    db.timeEntry.update({
      where: { id: entry.id },
      data: { clockInAt: nextClockIn, clockOutAt: nextClockOut, subtaskId: nextSubtaskId },
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
      subtaskId: entry.subtaskId,
      subtaskTitle: entry.subtask.title,
    },
    newValue: {
      clockInAt: nextClockIn,
      clockOutAt: nextClockOut,
      subtaskId: nextSubtaskId,
      subtaskTitle: newSubtaskTitle ?? entry.subtask.title,
    },
    description: `${admin.name} menyetujui koreksi jam kerja subtask "${entry.subtask.title}"${
      subtaskChanged ? ` → "${newSubtaskTitle}"` : ''
    }`,
  })

  return NextResponse.json({ ok: true, status: 'approved' })
}
