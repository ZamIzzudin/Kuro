// POST /api/time-entries/switch — pindah subtask tanpa clock out (rule #8, Q4: note opsional)
// Entry lama ditutup (clock_out = now), entry baru dibuka pada subtask baru — satu transaksi.
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
  const { subtaskId, note } = parsed.data

  const current = await findActiveEntry(user.id)
  if (!current) {
    return NextResponse.json({ error: 'Tidak ada sesi aktif untuk di-switch.' }, { status: 400 })
  }
  if (current.subtaskId === subtaskId) {
    return NextResponse.json(
      { error: 'Subtask tujuan sama dengan sesi yang sedang berjalan.' },
      { status: 400 }
    )
  }

  const result = await startSession({ userId: user.id, subtaskId, switchFromId: current.id })
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
    oldValue: {
      subtaskId: current.subtaskId,
      subtaskTitle: current.subtask.title,
      entryId: current.id,
    },
    newValue: { subtaskId, subtaskTitle: result.subtaskTitle, entryId: result.entry.id, note: note ?? null },
    description: `${user.name} switch subtask: "${current.subtask.title}" → "${result.subtaskTitle}"`,
  })

  if (result.autoAssigned) {
    await logActivity({
      userId: user.id,
      action: 'subtask_claimed',
      entityType: 'subtask',
      entityId: result.entry.subtask.id,
      newValue: { assigneeId: user.id },
      description: `Subtask "${result.subtaskTitle}" diklaim oleh ${user.name} saat switch`,
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

  return NextResponse.json({
    entry: result.entry,
    previousEntryId: result.previousEntryId,
    autoAssigned: result.autoAssigned,
    subtaskStatusChanged: result.statusChanged,
  })
}
