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
    else {
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
  | { ok: true; movedToBacklog: number; movedToSprint: number; stayedInSprint: number }
  | { ok: false; message: string; status: number }

/**
 * Tutup sprint.
 *
 * Aturan (revisi alur):
 * - Task `done` tetap di sprint sebagai hasil akhir.
 * - Task `review` TETAP di sprint lama (dianggap hampir selesai; hanya bisa maju ke done).
 * - Task belum selesai lainnya (`todo`/`in_progress`/`revision`) yang DIPILIH admin (`taskIds`)
 *   dipindah ke sprint tujuan BILA `moveToSprintId` diisi; task terpilih tanpa tujuan
 *   (dan task belum selesai yang tidak dipilih) dikembalikan ke Backlog.
 */
export async function closeSprint(opts: {
  sprintId: string
  moveToSprintId?: string | null
  taskIds?: string[]
  actorId: string
  now?: Date
}): Promise<CloseSprintResult> {
  const now = opts.now ?? new Date()
  const selected = new Set(opts.taskIds ?? [])

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

  // Task belum selesai yang bisa dipindah: todo / in_progress / revision.
  // Task `review` sengaja dikecualikan — tetap tinggal di sprint lama.
  const candidates = await db.task.findMany({
    where: { sprintId: sprint.id, status: { in: ['todo', 'in_progress', 'revision'] } },
    select: { id: true, status: true },
  })

  const movingToTarget = targetSprintId
    ? candidates.filter((t) => selected.has(t.id)).map((t) => t.id)
    : []
  const toBacklog = candidates.filter((t) => !movingToTarget.includes(t.id)).map((t) => t.id)
  const reviewStaying = await db.task.count({
    where: { sprintId: sprint.id, status: { in: ['review', 'done'] } },
  })

  await db.$transaction(async (tx) => {
    // Tutup keanggotaan sprint lama untuk task yang keluar (moved/carried_over)
    if (movingToTarget.length) {
      await tx.taskSprintHistory.updateMany({
        where: { sprintId: sprint.id, taskId: { in: movingToTarget }, leftAt: null },
        data: { leftAt: now, leftReason: 'moved' },
      })
    }
    if (toBacklog.length) {
      await tx.taskSprintHistory.updateMany({
        where: { sprintId: sprint.id, taskId: { in: toBacklog }, leftAt: null },
        data: { leftAt: now, leftReason: 'carried_over' },
      })
    }

    if (movingToTarget.length) {
      await tx.task.updateMany({ where: { id: { in: movingToTarget } }, data: { sprintId: targetSprintId } })
    }
    if (toBacklog.length) {
      await tx.task.updateMany({ where: { id: { in: toBacklog } }, data: { sprintId: null } })
    }

    await tx.sprint.update({ where: { id: sprint.id }, data: { status: 'completed' } })

    if (targetSprintId && movingToTarget.length) {
      await tx.taskSprintHistory.createMany({
        data: movingToTarget.map((taskId) => ({
          taskId,
          sprintId: targetSprintId as string,
          joinedAt: now,
        })),
      })
    }
  }, TX_OPTIONS)

  return {
    ok: true,
    movedToBacklog: toBacklog.length,
    movedToSprint: movingToTarget.length,
    stayedInSprint: reviewStaying,
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
