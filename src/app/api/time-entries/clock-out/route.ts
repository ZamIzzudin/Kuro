// POST /api/time-entries/clock-out — tutup sesi aktif (rule #9)
// note wajib >= 10 karakter + status task; status task juga diperbarui.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { createTimeEntryAttachments } from '@/lib/attachments'
import {
  PERIOD_LOCK_MESSAGE,
  STATUS_LABEL,
  TIME_ENTRY_INCLUDE,
  findActiveEntry,
  isPeriodLocked,
  mapTimeEntry,
} from '@/lib/time-entries'
import { clockOutSchema } from '@/lib/validators'

export async function POST(req: Request) {
  const { user, error } = await requireApiUser(['freelancer'])
  if (error) return error

  const parsed = await parseJson(req, clockOutSchema)
  if (parsed.error) return parsed.error
  const { note, taskStatus, attachments } = parsed.data

  const active = await findActiveEntry(user.id)
  if (!active) {
    return NextResponse.json({ error: 'Tidak ada sesi aktif untuk di-clock out.' }, { status: 400 })
  }

  const now = new Date()
  if (await isPeriodLocked(now)) {
    return NextResponse.json({ error: PERIOD_LOCK_MESSAGE }, { status: 423 })
  }

  // Task yang sudah Done/Dibatalkan terkunci — hanya admin yang boleh mengubah
  // statusnya. Bila admin menandai task selesai saat sesi berjalan, clock out tetap
  // menutup sesi tapi tidak menimpa status task (cegah revert oleh freelancer).
  const locked = active.task.status === 'done' || active.task.status === 'cancelled'
  const effectiveStatus = locked ? active.task.status : taskStatus

  const entry = await db.$transaction(async (tx) => {
    const updated = await tx.timeEntry.update({
      where: { id: active.id },
      data: { clockOutAt: now, note, taskStatusAtCheckout: effectiveStatus },
      include: TIME_ENTRY_INCLUDE,
    })
    if (attachments?.length) {
      await createTimeEntryAttachments(tx, active.id, attachments)
    }
    if (!locked) {
      await tx.task.update({ where: { id: active.taskId }, data: { status: taskStatus } })
    }
    return updated
  })

  await logActivity({
    userId: user.id,
    action: 'clock_out',
    entityType: 'time_entry',
    entityId: entry.id,
    newValue: { clockOutAt: entry.clockOutAt, note, taskStatus: effectiveStatus, attachmentCount: attachments?.length ?? 0 },
    description: `${user.name} clock out dari task "${active.task.title}" — status: ${STATUS_LABEL[effectiveStatus]}`,
  })

  if (!locked && active.task.status !== taskStatus) {
    await logActivity({
      userId: user.id,
      action: 'task_status_changed',
      entityType: 'task',
      entityId: active.taskId,
      oldValue: { status: active.task.status },
      newValue: { status: taskStatus },
      description: `Status task "${active.task.title}" diubah saat clock out: ${STATUS_LABEL[active.task.status]} → ${STATUS_LABEL[taskStatus]}`,
    })
  }

  return NextResponse.json({ entry: mapTimeEntry(entry, now) })
}
