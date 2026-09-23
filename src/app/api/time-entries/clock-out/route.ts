// POST /api/time-entries/clock-out — tutup sesi aktif (rule #9)
// note wajib >= 10 karakter + status task; status task juga diperbarui.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import {
  PERIOD_LOCK_MESSAGE,
  STATUS_LABEL,
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
  const { note, taskStatus } = parsed.data

  const active = await findActiveEntry(user.id)
  if (!active) {
    return NextResponse.json({ error: 'Tidak ada sesi aktif untuk di-clock out.' }, { status: 400 })
  }

  const now = new Date()
  if (await isPeriodLocked(now)) {
    return NextResponse.json({ error: PERIOD_LOCK_MESSAGE }, { status: 423 })
  }

  const [entry] = await db.$transaction([
    db.timeEntry.update({
      where: { id: active.id },
      data: { clockOutAt: now, note, taskStatusAtCheckout: taskStatus },
      include: {
        task: {
          include: {
            project: { select: { id: true, name: true } },
            workType: { select: { id: true, name: true } },
            requester: { select: { id: true, name: true } },
          },
        },
      },
    }),
    db.task.update({ where: { id: active.taskId }, data: { status: taskStatus } }),
  ])

  await logActivity({
    userId: user.id,
    action: 'clock_out',
    entityType: 'time_entry',
    entityId: entry.id,
    newValue: { clockOutAt: entry.clockOutAt, note, taskStatus },
    description: `${user.name} clock out dari task "${active.task.title}" — status: ${STATUS_LABEL[taskStatus]}`,
  })

  if (active.task.status !== taskStatus) {
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
