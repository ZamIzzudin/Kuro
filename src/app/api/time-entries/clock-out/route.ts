// POST /api/time-entries/clock-out — tutup sesi aktif (rule #9)
// note wajib >= 10 karakter + status SUBTASK; status subtask juga diperbarui.
// Bila semua subtask task selesai/dibatalkan, status TASK di-rollup menjadi done.
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from '@/lib/db'
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
import { closeSprintMembership } from '@/lib/sprints'
import { clockOutSchema } from '@/lib/validators'
import type { TaskStatus } from '@prisma/client'

/** Rollup status task dari subtask: done bila semua subtask done/cancelled. */
function rollupTaskStatus(statuses: TaskStatus[]): TaskStatus | null {
  if (statuses.length === 0) return null
  const active = statuses.filter((s) => s !== 'done' && s !== 'cancelled')
  if (active.length === 0) return 'done'
  if (active.some((s) => s === 'in_progress')) return 'in_progress'
  if (active.some((s) => s === 'review')) return 'review'
  return 'todo'
}

export async function POST(req: Request) {
  const { user, error } = await requireApiUser(['freelancer'])
  if (error) return error

  const parsed = await parseJson(req, clockOutSchema)
  if (parsed.error) return parsed.error
  const { note, subtaskStatus, attachments } = parsed.data

  const active = await findActiveEntry(user.id)
  if (!active) {
    return NextResponse.json({ error: 'Tidak ada sesi aktif untuk di-clock out.' }, { status: 400 })
  }

  const now = new Date()
  if (await isPeriodLocked(now)) {
    return NextResponse.json({ error: PERIOD_LOCK_MESSAGE }, { status: 423 })
  }

  // Subtask yang sudah Done/Dibatalkan terkunci — hanya admin yang boleh mengubah.
  const locked = active.subtask.status === 'done' || active.subtask.status === 'cancelled'
  const effectiveStatus = locked ? active.subtask.status : subtaskStatus

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
      await tx.subtask.update({ where: { id: active.subtaskId }, data: { status: subtaskStatus } })
    }

    // Rollup status task (bila belum done/cancelled — jangan timpa keputusan admin)
    const task = await tx.task.findUnique({
      where: { id: active.subtask.taskId },
      select: { status: true, sprintId: true },
    })
    if (task && task.status !== 'done' && task.status !== 'cancelled') {
      const siblings = await tx.subtask.findMany({
        where: { taskId: active.subtask.taskId },
        select: { status: true },
      })
      const next = rollupTaskStatus(siblings.map((s) => s.status))
      if (next && next !== task.status) {
        await tx.task.update({ where: { id: active.subtask.taskId }, data: { status: next } })
        // Task selesai → tutup keanggotaan sprint (riwayat permanen)
        if (next === 'done') {
          await closeSprintMembership(tx, active.subtask.taskId, 'completed', 'done', now)
        }
      }
    }

    return updated
  }, TX_OPTIONS)

  await logActivity({
    userId: user.id,
    action: 'clock_out',
    entityType: 'time_entry',
    entityId: entry.id,
    newValue: {
      clockOutAt: entry.clockOutAt,
      note,
      subtaskStatus: effectiveStatus,
      attachmentCount: attachments?.length ?? 0,
    },
    description: `${user.name} clock out dari subtask "${active.subtask.title}" — status: ${STATUS_LABEL[effectiveStatus]}`,
  })

  if (!locked && active.subtask.status !== subtaskStatus) {
    await logActivity({
      userId: user.id,
      action: 'subtask_status_changed',
      entityType: 'subtask',
      entityId: active.subtaskId,
      oldValue: { status: active.subtask.status },
      newValue: { status: subtaskStatus },
      description: `Status subtask "${active.subtask.title}" diubah saat clock out: ${STATUS_LABEL[active.subtask.status]} → ${STATUS_LABEL[subtaskStatus]}`,
    })
  }

  return NextResponse.json({ entry: mapTimeEntry(entry, now) })
}
