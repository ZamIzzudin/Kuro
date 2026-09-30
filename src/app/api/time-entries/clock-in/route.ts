// POST /api/time-entries/clock-in — mulai sesi kerja pada sebuah subtask
// Rule #1 (wajib pilih subtask), #2 (1 sesi aktif), #3 (done/cancelled tak bisa dipilih),
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

  const result = await startSession({ userId: user.id, subtaskId: parsed.data.subtaskId })
  if (!result.ok) return result.error

  await logActivity({
    userId: user.id,
    action: 'clock_in',
    entityType: 'time_entry',
    entityId: result.entry.id,
    newValue: { subtaskId: result.entry.subtask.id, clockInAt: result.entry.clockInAt },
    description: `${user.name} clock in pada subtask "${result.subtaskTitle}"`,
  })

  if (result.autoAssigned) {
    await logActivity({
      userId: user.id,
      action: 'subtask_claimed',
      entityType: 'subtask',
      entityId: result.entry.subtask.id,
      newValue: { assigneeId: user.id },
      description: `Subtask "${result.subtaskTitle}" diklaim oleh ${user.name}`,
    })
  }
  if (result.statusChanged) {
    await logActivity({
      userId: user.id,
      action: 'subtask_status_changed',
      entityType: 'subtask',
      entityId: result.entry.subtask.id,
      oldValue: { status: result.statusChanged.from },
      newValue: { status: result.statusChanged.to },
      description: `Status subtask "${result.subtaskTitle}" otomatis berubah: ${STATUS_LABEL[result.statusChanged.from]} → ${STATUS_LABEL[result.statusChanged.to]}`,
    })
  }

  return NextResponse.json(
    {
      entry: result.entry,
      autoAssigned: result.autoAssigned,
      subtaskStatusChanged: result.statusChanged,
    },
    { status: 201 }
  )
}
