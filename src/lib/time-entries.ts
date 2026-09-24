// Kuro — helper time entry (Fase 3 / F2)
// Aturan bisnis: rule #1 (tanpa task tidak ada clock in), #2 (1 sesi aktif), #7 (auto-assign),
// #11 (periode terkunci), #12 (freelancer hanya lihat miliknya).
import type { Prisma, TaskStatus } from '@prisma/client'
import { db } from './db'
import { mapAttachment, type AttachmentItem } from './attachments'
import { formatMinutes, wibYearMonth } from './time'

export const TIME_ENTRY_INCLUDE = {
  task: {
    include: {
      project: { select: { id: true, name: true } },
      workType: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true } },
    },
  },
  attachments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TimeEntryInclude

type TimeEntryWithTask = Prisma.TimeEntryGetPayload<{ include: typeof TIME_ENTRY_INCLUDE }>

export type TimeEntryItem = {
  id: string
  clockInAt: string
  clockOutAt: string | null
  /** durasi menit; untuk sesi aktif dihitung sampai sekarang */
  minutes: number
  /** true bila sesi masih berjalan (clockOutAt null) */
  active: boolean
  note: string | null
  taskStatusAtCheckout: TaskStatus | null
  task: {
    id: string
    title: string
    status: TaskStatus
    project: { id: string; name: string }
    workType: { id: string; name: string }
    requester: { id: string; name: string }
  }
  /** label durasi siap tampil, mis. "2j 35m" */
  durationLabel: string
  /** Lampiran yang diunggah saat clock out */
  attachments: AttachmentItem[]
}

export function mapTimeEntry(e: TimeEntryWithTask, now = new Date()): TimeEntryItem {
  const end = e.clockOutAt ?? now
  const minutes = Math.max(0, Math.floor((end.getTime() - e.clockInAt.getTime()) / 60_000))
  return {
    id: e.id,
    clockInAt: e.clockInAt.toISOString(),
    clockOutAt: e.clockOutAt ? e.clockOutAt.toISOString() : null,
    minutes,
    active: e.clockOutAt === null,
    note: e.note,
    taskStatusAtCheckout: e.taskStatusAtCheckout,
    task: {
      id: e.task.id,
      title: e.task.title,
      status: e.task.status,
      project: { id: e.task.project.id, name: e.task.project.name },
      workType: { id: e.task.workType.id, name: e.task.workType.name },
      requester: { id: e.task.requester.id, name: e.task.requester.name },
    },
    durationLabel: minutes < 1 ? '< 1m' : formatMinutes(minutes),
    attachments: e.attachments.map(mapAttachment),
  }
}

/** Sesi aktif milik user (rule #2: maksimal satu) */
export function findActiveEntry(userId: string) {
  return db.timeEntry.findFirst({
    where: { userId, clockOutAt: null },
    include: TIME_ENTRY_INCLUDE,
    orderBy: { clockInAt: 'desc' },
  })
}

/** Cek periode terkunci (rule #11) untuk sebuah timestamp */
export async function isPeriodLocked(at: Date): Promise<boolean> {
  const { year, month } = wibYearMonth(at)
  const lock = await db.periodLock.findUnique({ where: { year_month: { year, month } } })
  return !!lock
}

export const PERIOD_LOCK_MESSAGE =
  'Periode ini sudah dikunci. Hubungi admin untuk membuka kunci sebelum mengubah jam kerja.'

/** Label status task untuk pesan/audit */
export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
  cancelled: 'Dibatalkan',
}
