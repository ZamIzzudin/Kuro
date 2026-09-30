// Kuro — activity log service (business rule #6):
// SEMUA aksi (clock in/out, switch task, perubahan status, koreksi, lock, dsb.)
// wajib melewati fungsi ini. Tabel append-only (tidak ada UPDATE/DELETE).
import type { Prisma } from '@prisma/client'
import { db } from './db'

export type ActivityAction =
  | 'auth_login'
  | 'auth_logout'
  | 'password_reset_requested'
  | 'password_reset_done'
  | 'user_created'
  | 'user_updated'
  | 'task_created'
  | 'task_updated'
  | 'task_assigned'
  | 'task_status_changed'
  | 'subtask_created'
  | 'subtask_updated'
  | 'subtask_deleted'
  | 'subtask_claimed'
  | 'subtask_status_changed'
  | 'sprint_created'
  | 'sprint_updated'
  | 'sprint_started'
  | 'sprint_completed'
  | 'sprint_reopened'
  | 'sprint_deleted'
  | 'clock_in'
  | 'clock_out'
  | 'time_entry_backfilled'
  | 'switch_task'
  | 'time_entry_edited'
  | 'correction_submitted'
  | 'correction_approved'
  | 'correction_rejected'
  | 'period_locked'
  | 'period_unlocked'
  | 'project_created'
  | 'project_updated'
  | 'project_deleted'
  | 'master_created'
  | 'master_updated'
  | 'user_password_reset_by_admin'
  | 'profile_updated'
  | 'password_changed'

type LogInput = {
  userId?: string | null
  action: ActivityAction
  entityType?: 'user' | 'task' | 'subtask' | 'sprint' | 'time_entry' | 'correction' | 'period_lock' | string
  entityId?: string
  oldValue?: Prisma.InputJsonValue
  newValue?: Prisma.InputJsonValue
  description: string
}

export async function logActivity(input: LogInput) {
  await db.activityLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValue: input.oldValue,
      newValue: input.newValue,
      description: input.description,
    },
  })
}
