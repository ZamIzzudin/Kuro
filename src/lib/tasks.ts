// Kuro — helper task: include Prisma, mapping ke bentuk JSON (TaskItem), sorting
import type { Prisma, Priority, TaskStatus } from '@prisma/client'
import { db } from './db'
import { mapAttachment, type AttachmentItem } from './attachments'

export const TASK_INCLUDE = {
  project: true,
  workType: true,
  requester: true,
  assignee: { select: { id: true, name: true } },
  timeEntries: { select: { clockInAt: true, clockOutAt: true } },
  attachments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TaskInclude

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>

export type TaskItem = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: Priority
  /** null = belum diestimasi */
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
  assigneeId: string | null
  project: { name: string }
  workType: { name: string }
  requester: { name: string }
  assignee: { id: string; name: string } | null
  /** Total menit dari semua time entry selesai (clock_out terisi) */
  loggedMinutes: number
  /** Lampiran task (berkas/gambar) */
  attachments: AttachmentItem[]
  /** deadline lewat & belum done/cancelled (rule #10, runtime) */
  overdue: boolean
}

export function mapTask(t: TaskWithRelations): TaskItem {
  const loggedMinutes = t.timeEntries.reduce(
    (sum, e) =>
      sum + (e.clockOutAt ? Math.floor((e.clockOutAt.getTime() - e.clockInAt.getTime()) / 60_000) : 0),
    0
  )
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
    assigneeId: t.assigneeId,
    project: { name: t.project.name },
    workType: { name: t.workType.name },
    requester: { name: t.requester.name },
    assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
    loggedMinutes,
    attachments: t.attachments.map(mapAttachment),
    overdue: t.deadlineAt < new Date() && t.status !== 'done' && t.status !== 'cancelled',
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

/**
 * Scope task untuk freelancer (rule #12 + enhancement project):
 * - task yang di-assign ke dia (di project mana pun), ATAU
 * - task bucket bersama (assignee null) di project tempat dia menjadi member.
 */
export function freelancerTaskScope(userId: string): Prisma.TaskWhereInput {
  return {
    OR: [
      { assigneeId: userId },
      { assigneeId: null, project: { members: { some: { userId } } } },
    ],
  }
}

/** Scope project yang relevan untuk freelancer: dia member, atau punya task di sana. */
export function freelancerProjectScope(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [{ members: { some: { userId } } }, { tasks: { some: { assigneeId: userId } } }],
  }
}

/** Statistik task per project (untuk halaman pemilihan project) */
export type ProjectOverview = {
  id: string
  name: string
  /** Warna HEX banner (fallback tanpa gambar) */
  bannerColor: string | null
  /** URL proxy gambar banner — null bila tidak ada */
  bannerUrl: string | null
  isActive: boolean
  /** jumlah task yang terlihat oleh user */
  total: number
  /** task belum selesai (todo + in_progress + review) */
  active: number
  overdue: number
  /** task yang di-assign ke user ini */
  mine: number
  /** task bucket bersama (belum di-assign) */
  unassigned: number
  counts: { todo: number; in_progress: number; review: number; done: number; cancelled: number }
}
