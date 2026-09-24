// Kuro — helper bersama untuk memulai sesi kerja (clock in & switch task)
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

export type StartSessionResult =
  | {
      ok: true
      entry: TimeEntryItem
      autoAssigned: boolean
      taskStatusChanged: { from: TaskStatus; to: TaskStatus } | null
      taskTitle: string
      previousEntryId?: string
    }
  | { ok: false; error: NextResponse }

/**
 * Validasi + buat time entry baru (rule #1, #3, #7, #11, #12).
 * `switchFromId` diisi saat switch task → entry lama ditutup dalam transaksi yang sama (rule #8).
 */
export async function startSession(opts: {
  userId: string
  taskId: string
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

  const task = await db.task.findUnique({ where: { id: opts.taskId } })
  if (!task) {
    return { ok: false, error: NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 }) }
  }

  // Rule #3: task Done/Dibatalkan tidak bisa dipilih
  if (task.status === 'done' || task.status === 'cancelled') {
    return {
      ok: false,
      error: NextResponse.json(
        {
          error: `Task sudah ${task.status === 'done' ? 'selesai' : 'dibatalkan'} — tidak bisa dipilih.`,
        },
        { status: 400 }
      ),
    }
  }

  // Rule #12: freelancer hanya boleh mengerjakan task miliknya atau bucket bersama
  if (task.assigneeId !== null && task.assigneeId !== opts.userId) {
    return {
      ok: false,
      error: NextResponse.json({ error: 'Task ini di-assign ke freelancer lain.' }, { status: 403 }),
    }
  }

  // Rule #7: task unassigned → auto-assign; task To Do → In Progress
  const autoAssigned = task.assigneeId === null
  const nextStatus: TaskStatus | null = task.status === 'todo' ? 'in_progress' : null
  const taskStatusChanged = nextStatus !== null ? { from: task.status, to: nextStatus } : null

  try {
    const entry = await db.$transaction(async (tx) => {
      // Tutup entry lama bila ini switch (rule #8)
      if (opts.switchFromId) {
        await tx.timeEntry.update({
          where: { id: opts.switchFromId },
          data: { clockOutAt: now },
        })
      }

      if (autoAssigned || taskStatusChanged) {
        await tx.task.update({
          where: { id: task.id },
          data: {
            ...(autoAssigned ? { assigneeId: opts.userId } : {}),
            ...(taskStatusChanged ? { status: taskStatusChanged.to } : {}),
          },
        })
      }

      return tx.timeEntry.create({
        data: { userId: opts.userId, taskId: task.id, clockInAt: now },
        include: TIME_ENTRY_INCLUDE,
      })
    }, TX_OPTIONS)

    return {
      ok: true,
      entry: mapTimeEntry(entry, now),
      autoAssigned,
      taskStatusChanged,
      taskTitle: task.title,
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
