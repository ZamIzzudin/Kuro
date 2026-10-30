// Kuro — helper bersama untuk memulai sesi kerja (clock in & switch).
// Hierarki baru: sesi selalu terikat ke SUBTASK. Freelancer hanya boleh mengambil
// subtask pada task yang berada di sprint AKTIF (backlog tidak bisa dikerjakan).
import type { TaskStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from './db'
import {
  PERIOD_LOCK_MESSAGE,
  TIME_ENTRY_INCLUDE,
  isPeriodLocked,
  mapTimeEntry,
  type TimeEntryItem,
} from './time-entries'
import { syncTaskStatusFromSubtasks } from './task-status'

export type StartSessionResult =
  | {
      ok: true
      entry: TimeEntryItem
      autoAssigned: boolean
      statusChanged: { from: TaskStatus; to: TaskStatus } | null
      subtaskTitle: string
      previousEntryId?: string
    }
  | { ok: false; error: NextResponse }

/**
 * Validasi + buat time entry baru terhadap sebuah subtask (rule #1, #3, #7, #11, #12).
 * `switchFromId` diisi saat switch → entry lama ditutup dalam transaksi yang sama (rule #8).
 */
export async function startSession(opts: {
  userId: string
  subtaskId: string
  switchFromId?: string
  now?: Date
}): Promise<StartSessionResult> {
  const now = opts.now ?? new Date()

  // Rule #11: periode terkunci tidak boleh diubah
  if (await isPeriodLocked(now)) {
    return { ok: false, error: NextResponse.json({ error: PERIOD_LOCK_MESSAGE }, { status: 423 }) }
  }

  // Rule #2: satu sesi aktif per freelancer
  const active = await db.timeEntry.findFirst({
    where: { userId: opts.userId, clockOutAt: null },
    select: { id: true },
  })
  if (active && active.id !== opts.switchFromId) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: 'Anda masih punya sesi aktif. Lakukan switch task atau clock out dulu.' },
        { status: 409 }
      ),
    }
  }

  const subtask = await db.subtask.findUnique({
    where: { id: opts.subtaskId },
    include: {
      task: {
        include: {
          sprint: { select: { id: true, status: true } },
          assignees: { select: { userId: true } },
          project: { select: { members: { select: { userId: true } } } },
        },
      },
    },
  })
  if (!subtask) {
    return { ok: false, error: NextResponse.json({ error: 'Subtask tidak ditemukan.' }, { status: 404 }) }
  }

  // Rule #3: Done tidak bisa dipilih
  if (subtask.status === 'done') {
    return {
      ok: false,
      error: NextResponse.json(
        { error: 'Subtask sudah selesai — tidak bisa dipilih.' },
        { status: 400 }
      ),
    }
  }

  // Freelancer hanya mengerjakan subtask di sprint AKTIF (backlog di luar scope)
  if (!subtask.task.sprint || subtask.task.sprint.status !== 'active') {
    return {
      ok: false,
      error: NextResponse.json(
        { error: 'Task ini belum masuk sprint aktif — hubungi admin untuk memasukkannya ke sprint.' },
        { status: 409 }
      ),
    }
  }

  // Rule #12: subtask milik orang lain tidak bisa diambil; unassigned boleh (bucket bersama).
  if (subtask.assigneeId !== null && subtask.assigneeId !== opts.userId) {
    return {
      ok: false,
      error: NextResponse.json({ error: 'Subtask ini di-assign ke freelancer lain.' }, { status: 403 }),
    }
  }

  // Rule #7: subtask unassigned → auto-assign; To Do / Revisi → In Progress
  const autoAssigned = subtask.assigneeId === null
  const canStart = subtask.status === 'todo' || subtask.status === 'revision'
  const nextStatus: TaskStatus | null = canStart ? 'in_progress' : null
  const statusChanged = nextStatus !== null ? { from: subtask.status, to: nextStatus } : null

  try {
    const entry = await db.$transaction(async (tx) => {
      // Tutup entry lama bila ini switch (rule #8)
      if (opts.switchFromId) {
        await tx.timeEntry.update({
          where: { id: opts.switchFromId },
          data: { clockOutAt: now },
        })
      }

      if (autoAssigned || statusChanged) {
        await tx.subtask.update({
          where: { id: subtask.id },
          data: {
            ...(autoAssigned ? { assigneeId: opts.userId } : {}),
            ...(statusChanged ? { status: statusChanged.to } : {}),
          },
        })
      }

      // Status task induk mengikuti subtask (mis. task To Do → In Progress saat clock in).
      if (statusChanged) {
        await syncTaskStatusFromSubtasks(tx, subtask.taskId, now)
      }

      return tx.timeEntry.create({
        data: { userId: opts.userId, subtaskId: subtask.id, clockInAt: now },
        include: TIME_ENTRY_INCLUDE,
      })
    }, TX_OPTIONS)

    return {
      ok: true,
      entry: mapTimeEntry(entry, now),
      autoAssigned,
      statusChanged,
      subtaskTitle: subtask.title,
      previousEntryId: opts.switchFromId,
    }
  } catch (e) {
    // Race condition pada partial unique index (rule #2)
    if ((e as { code?: string }).code === 'P2002') {
      return {
        ok: false,
        error: NextResponse.json(
          { error: 'Anda sudah punya sesi aktif. Muat ulang halaman.' },
          { status: 409 }
        ),
      }
    }
    throw e
  }
}
