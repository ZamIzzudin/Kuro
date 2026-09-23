// POST /api/time-entries/clock-in — mulai sesi kerja pada sebuah task (F2)
// Rule #1 (wajib pilih task), #2 (1 sesi aktif), #3 (done/cancelled tak bisa dipilih),
// #7 (auto-assign + In Progress), #11 (periode terkunci), #12 (scope freelancer).
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { startSession } from '@/lib/session-start'
import { STATUS_LABEL } from '@/lib/time-entries'
import { clockInSchema } from '@/lib/validators'

export async function POST(req: Request) {
  const { user, error } = await requireApiUser(['freelancer'])
  if (error) return error

  const parsed = await parseJson(req, clockInSchema)
  if (parsed.error) return parsed.error

  const result = await startSession({ userId: user.id, taskId: parsed.data.taskId })
  if (!result.ok) return result.error

  await logActivity({
    userId: user.id,
    action: 'clock_in',
    entityType: 'time_entry',
    entityId: result.entry.id,
    newValue: { taskId: result.entry.task.id, clockInAt: result.entry.clockInAt },
    description: `${user.name} clock in pada task "${result.taskTitle}"`,
  })

  if (result.autoAssigned) {
    await logActivity({
      userId: user.id,
      action: 'task_assigned',
      entityType: 'task',
      entityId: result.entry.task.id,
      newValue: { assigneeId: user.id },
      description: `Task "${result.taskTitle}" auto-assign ke ${user.name} saat clock in`,
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

  return NextResponse.json(
    {
      entry: result.entry,
      autoAssigned: result.autoAssigned,
      taskStatusChanged: result.taskStatusChanged,
    },
    { status: 201 }
  )
}
