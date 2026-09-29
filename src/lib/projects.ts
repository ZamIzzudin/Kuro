// Kuro — helper Project (enhancement: banner, requester, member/assign freelancer)
import type { Prisma } from '@prisma/client'
import { db } from './db'

export const PROJECT_INCLUDE = {
  members: {
    include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
  },
  requesters: {
    include: { requester: { select: { id: true, name: true, isActive: true } } },
  },
  tasks: { select: { status: true, deadlineAt: true } },
} satisfies Prisma.ProjectInclude

type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>

export type ProjectMemberItem = { id: string; name: string; email: string; isActive: boolean }
export type ProjectRequesterItem = { id: string; name: string; isActive: boolean }

export type ProjectItem = {
  id: string
  name: string
  description: string | null
  /** Warna HEX banner (dipakai bila tidak ada gambar) */
  bannerColor: string | null
  /** true bila project punya gambar banner di MinIO */
  hasBanner: boolean
  /** URL gambar banner (proxy, ikut cache-busting) — null bila tidak ada */
  bannerUrl: string | null
  isActive: boolean
  /** jumlah task di project ini */
  taskCount: number
  /** jumlah task per status (untuk donut ringkasan) */
  counts: { todo: number; in_progress: number; review: number; done: number; cancelled: number }
  /** task belum selesai yang sudah lewat tenggat */
  overdue: number
  /** task belum selesai yang tenggatnya dalam 7 hari ke depan (belum lewat) */
  dueSoon: number
  members: ProjectMemberItem[]
  requesters: ProjectRequesterItem[]
  createdAt: string
}

/** URL proxy banner (dengan cache-busting dari object key). */
export function bannerUrlFor(p: { id: string; bannerKey: string | null }): string | null {
  if (!p.bannerKey) return null
  return `/api/projects/${p.id}/banner?v=${encodeURIComponent(p.bannerKey)}`
}

export function mapProject(p: ProjectWithRelations, now = new Date()): ProjectItem {
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  let overdue = 0
  let dueSoon = 0
  for (const t of p.tasks) {
    if (t.status === 'done' || t.status === 'cancelled') continue
    if (t.deadlineAt < now) overdue += 1
    else if (t.deadlineAt <= weekAhead) dueSoon += 1
  }
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    bannerColor: p.bannerColor,
    hasBanner: Boolean(p.bannerKey),
    bannerUrl: bannerUrlFor(p),
    isActive: p.isActive,
    taskCount: p.tasks.length,
    counts: {
      todo: p.tasks.filter((t) => t.status === 'todo').length,
      in_progress: p.tasks.filter((t) => t.status === 'in_progress').length,
      review: p.tasks.filter((t) => t.status === 'review').length,
      done: p.tasks.filter((t) => t.status === 'done').length,
      cancelled: p.tasks.filter((t) => t.status === 'cancelled').length,
    },
    overdue,
    dueSoon,
    members: p.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      isActive: m.user.isActive,
    })),
    requesters: p.requesters.map((r) => ({
      id: r.requester.id,
      name: r.requester.name,
      isActive: r.requester.isActive,
    })),
    createdAt: p.createdAt.toISOString(),
  }
}

export function listProjects(where?: Prisma.ProjectWhereInput) {
  return db.project.findMany({
    where,
    include: PROJECT_INCLUDE,
    orderBy: { name: 'asc' },
  })
}

export function findProject(id: string) {
  return db.project.findUnique({ where: { id }, include: PROJECT_INCLUDE })
}

/**
 * Ganti relasi requester/member sebuah project (delete + create dalam transaksi).
 * Dipakai saat create/update project dari form admin.
 */
export async function setProjectRelations(
  tx: Prisma.TransactionClient,
  projectId: string,
  input: { requesterIds?: string[]; memberIds?: string[] }
) {
  if (input.requesterIds) {
    await tx.projectRequester.deleteMany({ where: { projectId } })
    if (input.requesterIds.length) {
      await tx.projectRequester.createMany({
        data: input.requesterIds.map((requesterId) => ({ projectId, requesterId })),
        skipDuplicates: true,
      })
    }
  }
  if (input.memberIds) {
    await tx.projectMember.deleteMany({ where: { projectId } })
    if (input.memberIds.length) {
      await tx.projectMember.createMany({
        data: input.memberIds.map((userId) => ({ projectId, userId })),
        skipDuplicates: true,
      })
    }
  }
}

/** Validasi id requester (harus ada) & id member (harus freelancer) → pesan error Indonesia. */
export async function validateProjectRelations(input: {
  requesterIds?: string[]
  memberIds?: string[]
}): Promise<string | null> {
  if (input.requesterIds?.length) {
    const found = await db.requester.count({ where: { id: { in: input.requesterIds } } })
    if (found !== new Set(input.requesterIds).size) return 'Ada requester yang tidak ditemukan.'
  }
  if (input.memberIds?.length) {
    const found = await db.user.count({
      where: { id: { in: input.memberIds }, role: 'freelancer' },
    })
    if (found !== new Set(input.memberIds).size)
      return 'Member project harus user dengan role freelancer.'
  }
  return null
}
