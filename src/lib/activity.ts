// Notu — activity log service (business rule #6):
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
  | 'clock_in'
  | 'clock_out'
  | 'switch_task'
  | 'time_entry_edited'
  | 'correction_submitted'
  | 'correction_approved'
  | 'correction_rejected'
  | 'period_locked'
  | 'period_unlocked'

type LogInput = {
  userId?: string | null
  action: ActivityAction
  entityType?: 'user' | 'task' | 'time_entry' | 'correction' | 'period_lock' | string
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
