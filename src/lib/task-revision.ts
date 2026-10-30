// Kuro — aksi "Minta Revisi": kembalikan subtask terpilih ke status `revision`.
//
// Bukan task baru: task yang sama ditandai `revision`, tetap di sprint yang sama.
// Subtask terpilih → `revision` (bisa diambil ulang freelancer). Bila sebelumnya
// task `done` dan keanggotaan sprint-nya sudah ditutup, keanggotaan dibuka kembali.
import type { Prisma } from '@prisma/client'
import { recordSprintJoin } from './sprints'

export async function markTaskRevision(
  tx: Prisma.TransactionClient,
  taskId: string,
  subtaskIds: string[],
  note: string | null
) {
  const before = await tx.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { status: true, sprintId: true },
  })

  await tx.subtask.updateMany({
    where: { id: { in: subtaskIds }, taskId },
    data: { status: 'revision' },
  })

  await tx.task.update({
    where: { id: taskId },
    data: { status: 'revision', ...(note ? { revisionNote: note } : {}) },
  })

  // Task kembali dikerjakan di sprint yang sama → buka kembali keanggotaan sprint.
  if (before.status === 'done' && before.sprintId) {
    await recordSprintJoin(tx, taskId, before.sprintId)
  }

  return tx.task.findUniqueOrThrow({ where: { id: taskId } })
}
