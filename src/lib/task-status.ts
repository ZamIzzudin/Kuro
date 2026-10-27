// Kuro — sinkronisasi status TASK dari status SUBTASK (satu arah: subtask → task).
//
// Aturan rollup ada di `task-rollup.ts` (fungsi murni). Modul ini yang menerapkannya
// ke database setelah subtask dibuat/diubah/dihapus.
//
// Task berstatus `cancelled` bersifat terminal (keputusan admin) dan tidak pernah
// di-rollup ulang, agar pembatalan tidak "hidup kembali" saat subtask berubah.
import type { Prisma, TaskStatus } from '@prisma/client'
import { closeSprintMembership } from './sprints'
import { rollupTaskStatus } from './task-rollup'

export { rollupTaskStatus }

/**
 * Terapkan rollup ke task. Mengembalikan status baru bila berubah, `null` bila tidak.
 * Bila task menjadi `done`, keanggotaan sprint yang aktif ditutup (riwayat permanen).
 */
export async function syncTaskStatusFromSubtasks(
  tx: Prisma.TransactionClient,
  taskId: string,
  at: Date = new Date()
): Promise<TaskStatus | null> {
  const task = await tx.task.findUnique({ where: { id: taskId }, select: { status: true } })
  if (!task || task.status === 'cancelled') return null

  const subtasks = await tx.subtask.findMany({ where: { taskId }, select: { status: true } })
  const next = rollupTaskStatus(subtasks.map((s) => s.status))
  if (!next || next === task.status) return null

  await tx.task.update({ where: { id: taskId }, data: { status: next } })
  if (next === 'done') {
    await closeSprintMembership(tx, taskId, 'completed', 'done', at)
  }
  return next
}
