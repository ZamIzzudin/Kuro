// Kuro — helper Sprint.
// Sprint = timebox per project. Satu sprint aktif per project (dijaga unique index parsial).
// Task di luar sprint = Backlog; freelancer hanya boleh mengambil task di sprint aktif.
import type { Prisma, SprintStatus, TaskStatus } from '@prisma/client'
import { db, TX_OPTIONS } from './db'

export const SPRINT_INCLUDE = {
  project: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.SprintInclude

type SprintWithRelations = Prisma.SprintGetPayload<{ include: typeof SPRINT_INCLUDE }>

export type SprintItem = {
  id: string
  name: string
  goal: string | null
  projectId: string
  project: { id: string; name: string }
  startDate: string
  endDate: string
  status: SprintStatus
  createdBy: { id: string; name: string }
  createdAt: string
  /** ringkasan progres (dihitung dari task di sprint ini) */
  progress: {
    total: number
    done: number
    overdue: number
    /** task yang deadline-nya melewati tanggal selesai sprint (peringatan) */
    beyondDeadline: number
  }
}

type SprintCounts = {
  total: number
  done: number
  overdue: number
  beyondDeadline: number
}

const EMPTY_COUNTS: SprintCounts = { total: 0, done: 0, overdue: 0, beyondDeadline: 0 }

export function mapSprint(s: SprintWithRelations, counts: SprintCounts = EMPTY_COUNTS): SprintItem {
  return {
    id: s.id,
    name: s.name,
    goal: s.goal,
    projectId: s.projectId,
    project: { id: s.project.id, name: s.project.name },
    startDate: s.startDate.toISOString().slice(0, 10),
    endDate: s.endDate.toISOString().slice(0, 10),
    status: s.status,
    createdBy: { id: s.createdBy.id, name: s.createdBy.name },
    createdAt: s.createdAt.toISOString(),
    progress: counts,
  }
}

/** Statistik task per sprint (untuk daftar sprint). */
export async function sprintCounts(sprintIds: string[]): Promise<Map<string, SprintCounts>> {
  const map = new Map<string, SprintCounts>()
  if (!sprintIds.length) return map

  const tasks = await db.task.findMany({
    where: { sprintId: { in: sprintIds } },
    select: { sprintId: true, status: true, deadlineAt: true, sprint: { select: { endDate: true } } },
  })
  const now = new Date()
  for (const t of tasks) {
    if (!t.sprintId) continue
    const row = map.get(t.sprintId) ?? { ...EMPTY_COUNTS }
    row.total += 1
    if (t.status === 'done') row.done += 1
    else if (t.status !== 'cancelled') {
      if (t.deadlineAt < now) row.overdue += 1
      if (t.sprint && t.deadlineAt > t.sprint.endDate) row.beyondDeadline += 1
    }
    map.set(t.sprintId, row)
  }
  return map
}

export function listSprints(where: Prisma.SprintWhereInput = {}) {
  return db.sprint.findMany({ where, include: SPRINT_INCLUDE, orderBy: [{ startDate: 'desc' }] })
}

export function findSprint(id: string) {
  return db.sprint.findUnique({ where: { id }, include: SPRINT_INCLUDE })
}

/** Sprint aktif sebuah project (maksimal satu, dijaga unique index parsial). */
export function findActiveSprint(projectId: string) {
  return db.sprint.findFirst({
    where: { projectId, status: 'active' },
    include: SPRINT_INCLUDE,
  })
}

export type CloseSprintResult =
  | { ok: true; movedToBacklog: number; movedToSprint: number }
  | { ok: false; message: string; status: number }

/**
 * Tutup sprint: task yang belum selesai (todo/in_progress/review) dipindah
 * ke backlog (`sprintId = null`) atau ke sprint lain bila `moveToSprintId` diisi.
 *
 * Riwayat keanggotaan dicatat permanen di TaskSprintHistory (`leftReason`).
 * Task done/cancelled tetap tercatat di sprint sebagai hasil akhir sprint.
 */
export async function closeSprint(opts: {
  sprintId: string
  moveToSprintId?: string | null
  actorId: string
  now?: Date
}): Promise<CloseSprintResult> {
  const now = opts.now ?? new Date()

  const sprint = await db.sprint.findUnique({
    where: { id: opts.sprintId },
    select: { id: true, projectId: true, status: true },
  })
  if (!sprint) return { ok: false, message: 'Sprint tidak ditemukan.', status: 404 }
  if (sprint.status !== 'active') {
    return { ok: false, message: 'Hanya sprint aktif yang bisa ditutup.', status: 400 }
  }

  let targetSprintId: string | null = null
  if (opts.moveToSprintId) {
    const target = await db.sprint.findUnique({
      where: { id: opts.moveToSprintId },
      select: { id: true, projectId: true, status: true },
    })
    if (!target) return { ok: false, message: 'Sprint tujuan tidak ditemukan.', status: 404 }
    if (target.projectId !== sprint.projectId) {
      return { ok: false, message: 'Sprint tujuan harus berada di project yang sama.', status: 400 }
    }
    targetSprintId = target.id
  }

  const others = await db.task.findMany({
    where: {
      sprintId: sprint.id,
      status: { in: ['todo', 'in_progress', 'review'] },
    },
    select: { id: true, status: true },
  })

  await db.$transaction(async (tx) => {
    // Riwayat: tandai task yang meninggalkan sprint ini
    if (others.length) {
      await tx.taskSprintHistory.updateMany({
        where: { sprintId: sprint.id, taskId: { in: others.map((t) => t.id) }, leftAt: null },
        data: { leftAt: now, leftReason: targetSprintId ? 'moved' : 'carried_over' },
      })
    }

    // Pindahkan task yang belum selesai
    if (others.length) {
      await tx.task.updateMany({
        where: { id: { in: others.map((t) => t.id) } },
        data: { sprintId: targetSprintId },
      })
    }

    // Status task yang sudah selesai → tandai tetap di sprint (riwayat tetap terbuka)
    await tx.sprint.update({ where: { id: sprint.id }, data: { status: 'completed' } })

    // Task yang dipindah ke sprint tujuan → catat keanggotaan baru
    if (targetSprintId && others.length) {
      await tx.taskSprintHistory.createMany({
        data: others.map((t) => ({
          taskId: t.id,
          sprintId: targetSprintId as string,
          joinedAt: now,
        })),
      })
    }
  }, TX_OPTIONS)

  return {
    ok: true,
    movedToBacklog: targetSprintId ? 0 : others.length,
    movedToSprint: targetSprintId ? others.length : 0,
  }
}

/** Catat task masuk ke sprint (dipakai saat task dibuat/diubah/dipindah sprint). */
export async function recordSprintJoin(
  tx: Prisma.TransactionClient,
  taskId: string,
  sprintId: string | null | undefined,
  at: Date = new Date()
) {
  if (!sprintId) return
  await tx.taskSprintHistory.create({ data: { taskId, sprintId, joinedAt: at } })
}

/** Tutup keanggotaan sprint yang aktif untuk sebuah task (dipanggil sebelum pindah/lepas). */
export async function closeSprintMembership(
  tx: Prisma.TransactionClient,
  taskId: string,
  reason: string,
  statusAtLeave: TaskStatus | null = null,
  at: Date = new Date()
) {
  await tx.taskSprintHistory.updateMany({
    where: { taskId, leftAt: null },
    data: { leftAt: at, leftReason: reason, ...(statusAtLeave ? { statusAtLeave } : {}) },
  })
}
