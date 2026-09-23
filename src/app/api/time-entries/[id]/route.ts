// PATCH /api/time-entries/:id — edit langsung time entry oleh admin (Q5).
// Wajib alasan, ter-audit (nilai lama/baru). Memvalidasi rule #2, #11, tumpang tindih.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { validateEntryChange } from '@/lib/corrections'
import { TIME_ENTRY_INCLUDE, mapTimeEntry } from '@/lib/time-entries'
import { wibLocalToDate } from '@/lib/time'
import { timeEntryEditSchema } from '@/lib/validators'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(['admin'])
  if (error) return error

  const parsed = await parseJson(req, timeEntryEditSchema)
  if (parsed.error) return parsed.error
  const { clockInLocal, clockOutLocal, taskId, note, reason } = parsed.data

  const before = await db.timeEntry.findUnique({
    where: { id: params.id },
    include: TIME_ENTRY_INCLUDE,
  })
  if (!before) return NextResponse.json({ error: 'Time entry tidak ditemukan.' }, { status: 404 })

  const nextClockIn = clockInLocal ? wibLocalToDate(clockInLocal) : before.clockInAt
  const nextClockOut =
    clockOutLocal === undefined
      ? before.clockOutAt
      : clockOutLocal === null
        ? null
        : wibLocalToDate(clockOutLocal)
  const nextTaskId = taskId ?? before.taskId

  const invalid = await validateEntryChange({
    userId: before.userId,
    entryId: before.id,
    clockInAt: nextClockIn,
    clockOutAt: nextClockOut,
    taskId: nextTaskId !== before.taskId ? nextTaskId : undefined,
  })
  if (invalid) {
    return NextResponse.json({ error: invalid.message }, { status: invalid.status })
  }

  const updated = await db.timeEntry.update({
    where: { id: before.id },
    data: {
      clockInAt: nextClockIn,
      clockOutAt: nextClockOut,
      taskId: nextTaskId,
      ...(note !== undefined ? { note: note || null } : {}),
    },
    include: TIME_ENTRY_INCLUDE,
  })

  await logActivity({
    userId: admin.id,
    action: 'time_entry_edited',
    entityType: 'time_entry',
    entityId: updated.id,
    oldValue: {
      clockInAt: before.clockInAt,
      clockOutAt: before.clockOutAt,
      taskId: before.taskId,
      taskTitle: before.task.title,
      note: before.note,
    },
    newValue: {
      clockInAt: updated.clockInAt,
      clockOutAt: updated.clockOutAt,
      taskId: updated.taskId,
      taskTitle: updated.task.title,
      note: updated.note,
    },
    description: `${admin.name} mengedit langsung time entry task "${before.task.title}" — alasan: ${reason}`,
  })

  return NextResponse.json({ entry: mapTimeEntry(updated) })
}
