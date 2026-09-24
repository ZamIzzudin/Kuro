// Kuro — helper koreksi time entry (Fase 6 / F6)
// Aturan terkait: rule #2 (1 sesi aktif), #11 (periode terkunci), #12 (scope freelancer).
import type { CorrectionStatus, Prisma } from '@prisma/client'
import { db } from './db'
import { PERIOD_LOCK_MESSAGE, isPeriodLocked, TIME_ENTRY_INCLUDE } from './time-entries'
import { wibYearMonth } from './time'

export const CORRECTION_INCLUDE = {
  timeEntry: { include: TIME_ENTRY_INCLUDE },
  requestedBy: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.CorrectionRequestInclude

type CorrectionWithRelations = Prisma.CorrectionRequestGetPayload<{
  include: typeof CORRECTION_INCLUDE
}>

export type CorrectionEntrySnapshot = {
  id: string
  clockInAt: string
  clockOutAt: string | null
  active: boolean
  minutes: number
  note: string | null
  taskId: string
  taskTitle: string
  project: string
  workType: string
  requester: string
  /** true bila periode entri ini terkunci (rule #11) */
  locked: boolean
}

export type CorrectionItem = {
  id: string
  status: CorrectionStatus
  reason: string
  createdAt: string
  reviewedAt: string | null
  reviewNote: string | null
  timeEntryId: string
  requestedBy: { id: string; name: string; email: string }
  reviewedBy: { id: string; name: string } | null
  /** nilai saat ini pada time entry */
  current: CorrectionEntrySnapshot
  /** nilai usulan — null berarti tidak diubah */
  proposed: {
    clockInAt: string | null
    clockOutAt: string | null
    taskId: string | null
    taskTitle: string | null
  }
  /** ada usulan perubahan? */
  hasProposal: boolean
}

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000))
}

export function mapCorrection(
  c: CorrectionWithRelations,
  taskTitles: Map<string, string> = new Map()
): CorrectionItem {
  const e = c.timeEntry
  const end = e.clockOutAt ?? new Date()
  return {
    id: c.id,
    status: c.status,
    reason: c.reason,
    createdAt: c.createdAt.toISOString(),
    reviewedAt: c.reviewedAt ? c.reviewedAt.toISOString() : null,
    reviewNote: c.reviewNote,
    timeEntryId: c.timeEntryId,
    requestedBy: c.requestedBy,
    reviewedBy: c.reviewedBy,
    current: {
      id: e.id,
      clockInAt: e.clockInAt.toISOString(),
      clockOutAt: e.clockOutAt ? e.clockOutAt.toISOString() : null,
      active: e.clockOutAt === null,
      minutes: minutesBetween(e.clockInAt, end),
      note: e.note,
      taskId: e.task.id,
      taskTitle: e.task.title,
      project: e.task.project.name,
      workType: e.task.workType.name,
      requester: e.task.requester.name,
      locked: false,
    },
    proposed: {
      clockInAt: c.newClockInAt ? c.newClockInAt.toISOString() : null,
      clockOutAt: c.newClockOutAt ? c.newClockOutAt.toISOString() : null,
      taskId: c.newTaskId,
      taskTitle: c.newTaskId ? taskTitles.get(c.newTaskId) ?? null : null,
    },
    hasProposal: !!(c.newClockInAt || c.newClockOutAt || c.newTaskId),
  }
}

/** Ambil daftar koreksi (join judul task usulan + status lock per entri). */
export async function listCorrections(where: Prisma.CorrectionRequestWhereInput) {
  const rows = await db.correctionRequest.findMany({
    where,
    include: CORRECTION_INCLUDE,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 300,
  })

  const proposedTaskIds = Array.from(
    new Set(rows.map((r) => r.newTaskId).filter((v): v is string => !!v))
  )
  const proposedTasks = proposedTaskIds.length
    ? await db.task.findMany({
        where: { id: { in: proposedTaskIds } },
        select: { id: true, title: true },
      })
    : []
  const taskTitles = new Map(proposedTasks.map((t) => [t.id, t.title]))

  const locks = await db.periodLock.findMany({ select: { year: true, month: true } })
  const lockedKeys = new Set(locks.map((l) => `${l.year}-${l.month}`))
  const isLocked = (at: Date) => {
    const { year, month } = wibYearMonth(at)
    return lockedKeys.has(`${year}-${month}`)
  }

  return rows.map((r) => {
    const item = mapCorrection(r, taskTitles)
    const lockIn = isLocked(r.timeEntry.clockInAt)
    const lockOut = r.timeEntry.clockOutAt ? isLocked(r.timeEntry.clockOutAt) : false
    item.current.locked = lockIn || lockOut
    return item
  })
}

export function findCorrection(id: string) {
  return db.correctionRequest.findUnique({ where: { id }, include: CORRECTION_INCLUDE })
}

/** Ada koreksi lain yang masih pending untuk entri ini? */
export function hasPendingCorrection(timeEntryId: string, exceptId?: string) {
  return db.correctionRequest.findFirst({
    where: {
      timeEntryId,
      status: 'pending',
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  })
}

const MAX_DATE = new Date('9999-12-31T23:59:59.999Z')

export type ChangeValidation = { message: string; status: number } | null

/**
 * Validasi perubahan time entry (dipakai saat approve koreksi & edit langsung admin — Q5).
 * Mengembalikan null bila valid. Memeriksa rule #2, #11, dan tumpang tindih sesi.
 */
export async function validateEntryChange(opts: {
  userId: string
  entryId: string
  clockInAt: Date
  clockOutAt: Date | null
  taskId?: string
}): Promise<ChangeValidation> {
  if (opts.clockOutAt && opts.clockOutAt.getTime() <= opts.clockInAt.getTime()) {
    return { message: 'Jam keluar harus setelah jam masuk.', status: 400 }
  }

  // Rule #11: periode terkunci tidak bisa diubah
  if (await isPeriodLocked(opts.clockInAt)) {
    return { message: PERIOD_LOCK_MESSAGE, status: 423 }
  }
  if (opts.clockOutAt && (await isPeriodLocked(opts.clockOutAt))) {
    return { message: PERIOD_LOCK_MESSAGE, status: 423 }
  }

  // Rule #2: hasil akhir hanya boleh satu sesi aktif per freelancer
  if (opts.clockOutAt === null) {
    const otherActive = await db.timeEntry.findFirst({
      where: { userId: opts.userId, clockOutAt: null, id: { not: opts.entryId } },
      select: { id: true },
    })
    if (otherActive) {
      return { message: 'Freelancer ini masih punya sesi aktif lain.', status: 409 }
    }
  }

  // Tidak boleh tumpang tindih dengan sesi lain milik freelancer yang sama
  const start = opts.clockInAt
  const end = opts.clockOutAt ?? MAX_DATE
  const conflict = await db.timeEntry.findFirst({
    where: {
      userId: opts.userId,
      id: { not: opts.entryId },
      clockInAt: { lt: end },
      OR: [{ clockOutAt: null }, { clockOutAt: { gt: start } }],
    },
    select: { id: true },
  })
  if (conflict) {
    return { message: 'Rentang waktu bertumpang tindih dengan sesi kerja lain.', status: 409 }
  }

  if (opts.taskId) {
    const task = await db.task.findUnique({ where: { id: opts.taskId }, select: { id: true } })
    if (!task) return { message: 'Task tidak ditemukan.', status: 400 }
  }

  return null
}
