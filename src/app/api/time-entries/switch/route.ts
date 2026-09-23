// POST /api/time-entries/switch — pindah task tanpa clock out (rule #8, Q4: note opsional)
// Entry lama ditutup (clock_out = now), entry baru dibuka pada task baru — dalam satu transaksi.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { startSession } from '@/lib/session-start'
import { STATUS_LABEL, findActiveEntry } from '@/lib/time-entries'
import { switchTaskSchema } from '@/lib/validators'

export async function POST(req: Request) {
  const { user, error } = await requireApiUser(['freelancer'])
  if (error) return error

  const parsed = await parseJson(req, switchTaskSchema)
  if (parsed.error) return parsed.error
  const { taskId, note } = parsed.data

  const current = await findActiveEntry(user.id)
  if (!current) {
    return NextResponse.json({ error: 'Tidak ada sesi aktif untuk di-switch.' }, { status: 400 })
  }
  if (current.taskId === taskId) {
    return NextResponse.json(
      { error: 'Task tujuan sama dengan sesi yang sedang berjalan.' },
      { status: 400 }
    )
  }

  const result = await startSession({ userId: user.id, taskId, switchFromId: current.id })
  if (!result.ok) return result.error

  // Catat note pada entry lama (opsional saat switch — Q4)
  if (note) {
    await db.timeEntry.update({ where: { id: current.id }, data: { note } })
  }

  await logActivity({
    userId: user.id,
    action: 'switch_task',
    entityType: 'time_entry',
    entityId: result.entry.id,
    oldValue: { taskId: current.taskId, taskTitle: current.task.title, entryId: current.id },
    newValue: { taskId, taskTitle: result.taskTitle, entryId: result.entry.id, note: note ?? null },
    description: `${user.name} switch task: "${current.task.title}" → "${result.taskTitle}"`,
  })

  if (result.autoAssigned) {
    await logActivity({
      userId: user.id,
      action: 'task_assigned',
      entityType: 'task',
      entityId: result.entry.task.id,
      newValue: { assigneeId: user.id },
      description: `Task "${result.taskTitle}" auto-assign ke ${user.name} saat switch task`,
    })
  }
  if (result.taskStatusChanged) {
    await logActivity({
      userId: user.id,
      action: 'task_status_changed',
      entityType: 'task',
      entityId: result.entry.task.id,
      oldValue: { status: result.taskStatusChanged.from },
      newValue: { status: result.taskStatusChanged.to },
      description: `Status task "${result.taskTitle}" otomatis berubah: ${STATUS_LABEL[result.taskStatusChanged.from]} → ${STATUS_LABEL[result.taskStatusChanged.to]}`,
    })
  }

  return NextResponse.json({
    entry: result.entry,
    previousEntryId: result.previousEntryId,
    autoAssigned: result.autoAssigned,
    taskStatusChanged: result.taskStatusChanged,
  })
}
