// Kuro — aturan rollup status TASK dari status SUBTASK (fungsi murni, tanpa DB).
//
// Dipakai agar status task induk mencerminkan subtask-nya secara otomatis:
// - semua subtask done/cancelled   → task done
// - sisa subtask semuanya review    → task review
// - ada subtask in_progress         → task in_progress
// - selain itu                      → task todo
import type { TaskStatus } from '@prisma/client'

/** Hitung status task dari sekumpulan status subtask. `null` bila tak ada subtask. */
export function rollupTaskStatus(statuses: TaskStatus[]): TaskStatus | null {
  if (statuses.length === 0) return null
  const remaining = statuses.filter((s) => s !== 'done' && s !== 'cancelled')
  if (remaining.length === 0) return 'done'
  if (remaining.every((s) => s === 'review')) return 'review'
  if (remaining.some((s) => s === 'in_progress')) return 'in_progress'
  return 'todo'
}
