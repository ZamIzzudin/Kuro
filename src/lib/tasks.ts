// Kuro — helper Task & Subtask.
// Hierarki: Project → Sprint → Task → Subtask.
// - Sprint = timebox; task tanpa sprint = Backlog.
// - Task = unit "cerita"; punya metadata bisnis, brief/lampiran, dan pool assignee.
// - Subtask = unit kerja terdalam; di sini freelancer clock in/out.
import type { Prisma, Priority, TaskStatus } from '@prisma/client'
import { db } from './db'
import { mapAttachment, type AttachmentItem } from './attachments'

// ===== Include & mapping =====

export const SUBTASK_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  attachments: { orderBy: { createdAt: 'asc' } },
  timeEntries: { select: { clockInAt: true, clockOutAt: true } },
} satisfies Prisma.SubtaskInclude

export const TASK_INCLUDE = {
  project: { select: { id: true, name: true } },
  sprint: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
  workType: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true } },
  assignees: { include: { user: { select: { id: true, name: true } } } },
  attachments: { orderBy: { createdAt: 'asc' } },
  subtasks: { include: SUBTASK_INCLUDE, orderBy: { position: 'asc' } },
  // Relasi revisi: task asal (bila ini revisi) & daftar revisi turunannya.
  revisionOf: { select: { id: true, title: true, status: true } },
  revisions: {
    select: { id: true, title: true, status: true, sprintId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.TaskInclude

type SubtaskWithRelations = Prisma.SubtaskGetPayload<{ include: typeof SUBTASK_INCLUDE }>
type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>

export type SubtaskItem = {
  id: string
  taskId: string
  title: string
  description: string | null
  status: TaskStatus
  assigneeId: string | null
  assignee: { id: string; name: string } | null
  position: number
  estimatedHours: number | null
  /** total menit tercatat (entry selesai) */
  loggedMinutes: number
  attachments: AttachmentItem[]
  createdAt: string
  updatedAt: string
}

export type TaskItem = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: Priority
  estimatedHours: number | null
  /** yyyy-MM-dd (kolom @db.Date, tanggal permintaan) */
  requestDate: string
  /** ISO UTC — tenggat */
  deadlineAt: string
  createdAt: string
  updatedAt: string
  projectId: string
  workTypeId: string
  requesterId: string
  /** null = Backlog (di luar sprint) */
  sprintId: string | null
  project: { id: string; name: string }
  sprint: { id: string; name: string; status: string; startDate: string; endDate: string } | null
  workType: { id: string; name: string }
  requester: { id: string; name: string }
  /** freelancer yang di-assign ke task (pool) */
  assignees: Array<{ id: string; name: string }>
  /** Lampiran brief/referensi level task */
  attachments: AttachmentItem[]
  subtasks: SubtaskItem[]
  /** task ini lahir sebagai revisi dari task lain */
  isRevision: boolean
  /** catatan alasan revisi (diisi admin) */
  revisionNote: string | null
  /** task asal yang direvisi (null bila task biasa) */
  revisionOf: { id: string; title: string; status: TaskStatus } | null
  /** daftar task revisi yang lahir dari task ini */
  revisions: Array<{ id: string; title: string; status: TaskStatus; sprintId: string | null; createdAt: string }>
  /** Total menit dari semua subtask (entry selesai) */
  loggedMinutes: number
  /** deadline lewat & belum done/cancelled (rule #10, runtime) */
  overdue: boolean
  /** deadline task melewati tanggal selesai sprint (peringatan, bukan error) */
  beyondSprint: boolean
  /** ringkasan progres subtask */
  subtaskProgress: { total: number; done: number; cancelled: number }
}

function sumLoggedMinutes(entries: Array<{ clockInAt: Date; clockOutAt: Date | null }>): number {
  return entries.reduce(
    (sum, e) =>
      sum + (e.clockOutAt ? Math.floor((e.clockOutAt.getTime() - e.clockInAt.getTime()) / 60_000) : 0),
    0
  )
}

export function mapSubtask(s: SubtaskWithRelations): SubtaskItem {
  return {
    id: s.id,
    taskId: s.taskId,
    title: s.title,
    description: s.description,
    status: s.status,
    assigneeId: s.assigneeId,
    assignee: s.assignee ? { id: s.assignee.id, name: s.assignee.name } : null,
    position: s.position,
    estimatedHours: s.estimatedHours === null ? null : Number(s.estimatedHours),
    loggedMinutes: sumLoggedMinutes(s.timeEntries),
    attachments: s.attachments.map(mapAttachment),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

export function mapTask(t: TaskWithRelations, now = new Date()): TaskItem {
  const subtasks = t.subtasks.map(mapSubtask)
  const loggedMinutes = subtasks.reduce((sum, s) => sum + s.loggedMinutes, 0)
  const done = subtasks.filter((s) => s.status === 'done').length
  const cancelled = subtasks.filter((s) => s.status === 'cancelled').length
  const sprintEnd = t.sprint ? new Date(t.sprint.endDate) : null
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    estimatedHours: t.estimatedHours === null ? null : Number(t.estimatedHours),
    requestDate: t.requestDate.toISOString().slice(0, 10),
    deadlineAt: t.deadlineAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    projectId: t.projectId,
    workTypeId: t.workTypeId,
    requesterId: t.requesterId,
    sprintId: t.sprintId,
    project: { id: t.project.id, name: t.project.name },
    sprint: t.sprint
      ? {
          id: t.sprint.id,
          name: t.sprint.name,
          status: t.sprint.status,
          startDate: t.sprint.startDate.toISOString().slice(0, 10),
          endDate: t.sprint.endDate.toISOString().slice(0, 10),
        }
      : null,
    workType: { id: t.workType.id, name: t.workType.name },
    requester: { id: t.requester.id, name: t.requester.name },
    assignees: t.assignees.map((a) => ({ id: a.user.id, name: a.user.name })),
    attachments: t.attachments.map(mapAttachment),
    subtasks,
    isRevision: t.isRevision,
    revisionNote: t.revisionNote,
    revisionOf: t.revisionOf
      ? { id: t.revisionOf.id, title: t.revisionOf.title, status: t.revisionOf.status }
      : null,
    revisions: t.revisions.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      sprintId: r.sprintId,
      createdAt: r.createdAt.toISOString(),
    })),
    loggedMinutes,
    overdue: t.deadlineAt < now && t.status !== 'done' && t.status !== 'cancelled',
    // Peringatan: deadline task melewati tanggal selesai sprint
    beyondSprint: !!(sprintEnd && t.deadlineAt > sprintEnd),
    subtaskProgress: { total: subtasks.length, done, cancelled },
  }
}

/** Urutkan: prioritas → tenggat → terbaru dibuat */
export function sortTasks(items: TaskItem[]): TaskItem[] {
  const rank: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
  return [...items].sort((a, b) => {
    if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority]
    const da = new Date(a.deadlineAt).getTime()
    const db_ = new Date(b.deadlineAt).getTime()
    if (da !== db_) return da - db_
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

/** Ambil task + relasi */
export function findTask(id: string) {
  return db.task.findUnique({ where: { id }, include: TASK_INCLUDE })
}

export function findSubtask(id: string) {
  return db.subtask.findUnique({
    where: { id },
    include: {
      ...SUBTASK_INCLUDE,
      task: {
        include: {
          project: { select: { id: true, name: true, members: { select: { userId: true } } } },
          workType: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true } },
          sprint: { select: { id: true, status: true, endDate: true } },
          assignees: { select: { userId: true } },
        },
      },
    },
  })
}

export type SubtaskWithTask = NonNullable<Awaited<ReturnType<typeof findSubtask>>>

/**
 * Scope task untuk freelancer (rule #12):
 * - task yang di-assign ke dia (TaskAssignee), ATAU
 * - task di project tempat dia member.
 * (Bolehnya mengerjakan ditentukan oleh scope subtask, bukan task.)
 */
export function freelancerTaskScope(userId: string): Prisma.TaskWhereInput {
  return {
    OR: [{ assignees: { some: { userId } } }, { project: { members: { some: { userId } } } }],
  }
}

/**
 * Scope subtask untuk freelancer — daftar unit kerja yang boleh ia lihat/kerjakan:
 * - subtask yang di-assign ke dia, ATAU
 * - subtask unassigned di task yang dia di-assign, ATAU
 * - subtask unassigned di project tempat dia member.
 * Hanya task di sprint AKTIF yang bisa diambil (freelancer tidak mengambil backlog).
 */
export function freelancerSubtaskScope(userId: string): Prisma.SubtaskWhereInput {
  return {
    OR: [
      { assigneeId: userId },
      { assigneeId: null, task: { assignees: { some: { userId } } } },
      { assigneeId: null, task: { project: { members: { some: { userId } } } } },
    ],
  }
}

/** Scope project yang relevan untuk freelancer: dia member, atau punya task di sana. */
export function freelancerProjectScope(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [{ members: { some: { userId } } }, { tasks: { some: { assignees: { some: { userId } } } } }],
  }
}

/** Statistik task per project (untuk halaman pemilihan project) */
export type ProjectOverview = {
  id: string
  name: string
  bannerColor: string | null
  bannerUrl: string | null
  isActive: boolean
  /** jumlah task yang terlihat oleh user */
  total: number
  active: number
  overdue: number
  dueSoon: number
  /** task di sprint aktif */
  inActiveSprint: number
  /** task di backlog (tanpa sprint) */
  backlog: number
  /** task tanpa assignee sama sekali */
  unassigned: number
  counts: { todo: number; in_progress: number; review: number; done: number; cancelled: number }
}
