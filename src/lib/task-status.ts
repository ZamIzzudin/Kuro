// Kuro — sinkronisasi status TASK dari status SUBTASK (satu arah: subtask → task).
//
// Aturan rollup ada di `task-rollup.ts` (fungsi murni). Modul ini yang menerapkannya
// ke database setelah subtask dibuat/diubah/dihapus.
//
// Pengecualian (freeze): task yang sudah `review` dan berada di sprint yang sudah
// `completed` hanya boleh BOLEH dinaikkan ke `done` — statusnya tidak boleh turun lagi
// saat subtask berubah. Begitu pula task yang sudah `done` tidak pernah di-rollup ulang.
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
  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: { status: true, sprint: { select: { status: true } } },
  })
  if (!task) return null

  const subtasks = await tx.subtask.findMany({ where: { taskId }, select: { status: true } })
  const next = rollupTaskStatus(subtasks.map((s) => s.status))
  if (!next || next === task.status) return null

  // Freeze: task `done` bersifat terminal — kecuali dibuka kembali lewat
  // Minta Revisi (subtask menjadi `revision`), yang menurunkan task ke `revision`.
  if (task.status === 'done' && next !== 'revision') return null
  // Task `review` di sprint yang SUDAH selesai: hanya boleh maju ke `done`.
  if (task.status === 'review' && task.sprint?.status === 'completed' && next !== 'done') return null

  await tx.task.update({ where: { id: taskId }, data: { status: next } })
  if (next === 'done') {
    await closeSprintMembership(tx, taskId, 'completed', 'done', at)
  }
  return next
}
