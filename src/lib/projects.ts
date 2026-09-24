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
  _count: { select: { tasks: true } },
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
  taskCount: number
  members: ProjectMemberItem[]
  requesters: ProjectRequesterItem[]
  createdAt: string
}

/** URL proxy banner (dengan cache-busting dari object key). */
export function bannerUrlFor(p: { id: string; bannerKey: string | null }): string | null {
  if (!p.bannerKey) return null
  return `/api/projects/${p.id}/banner?v=${encodeURIComponent(p.bannerKey)}`
}

export function mapProject(p: ProjectWithRelations): ProjectItem {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    bannerColor: p.bannerColor,
    hasBanner: Boolean(p.bannerKey),
    bannerUrl: bannerUrlFor(p),
    isActive: p.isActive,
    taskCount: p._count.tasks,
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
