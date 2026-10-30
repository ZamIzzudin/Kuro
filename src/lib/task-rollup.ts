// Kuro — aturan rollup status TASK dari status SUBTASK (fungsi murni, tanpa DB).
//
// Dipakai agar status task induk mencerminkan subtask-nya secara otomatis:
// - ada subtask `revision`                    → task revision (minta revisi)
// - semua subtask `done`                      → task done
// - sisa subtask semuanya `review`            → task review
// - ada subtask `in_progress`                 → task in_progress
// - selain itu (semua todo / campuran todo)   → task todo
//
// Catatan: task hanya `todo` bila SELURUH subtask `todo`; begitu ada satu yang
// bergerak (in_progress/review/revision) task tidak lagi dianggap todo.
import type { TaskStatus } from '@prisma/client'

/** Hitung status task dari sekumpulan status subtask. `null` bila tak ada subtask. */
export function rollupTaskStatus(statuses: TaskStatus[]): TaskStatus | null {
  if (statuses.length === 0) return null
  const remaining = statuses.filter((s) => s !== 'done')
  if (remaining.length === 0) return 'done'
  if (remaining.some((s) => s === 'revision')) return 'revision'
  if (remaining.every((s) => s === 'review')) return 'review'
  if (remaining.some((s) => s === 'in_progress')) return 'in_progress'
  return 'todo'
}
