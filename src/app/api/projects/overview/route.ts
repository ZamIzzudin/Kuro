// /api/projects/overview — daftar project + statistik task (untuk UI per-project)
// Admin: semua project. Freelancer: project tempat dia member atau punya task (rule #12).
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { freelancerProjectScope, freelancerTaskScope, type ProjectOverview } from '@/lib/tasks'
import { bannerUrlFor } from '@/lib/projects'

export async function GET() {
  const { user, error } = await requireApiUser()
  if (error) return error

  const isFreelancer = user.role === 'freelancer'
  const taskScope = isFreelancer ? freelancerTaskScope(user.id) : {}
  const projectWhere = isFreelancer
    ? { isActive: true, ...freelancerProjectScope(user.id) }
    : undefined

  const projects = await db.project.findMany({
    where: projectWhere,
    orderBy: { name: 'asc' },
    include: {
      tasks: {
        where: taskScope,
        select: { status: true, deadlineAt: true, assigneeId: true },
      },
    },
  })

  const now = new Date()
  const items: ProjectOverview[] = projects.map((p) => {
    const counts = { todo: 0, in_progress: 0, review: 0, done: 0, cancelled: 0 }
    let overdue = 0
    let mine = 0
    let unassigned = 0
    let active = 0

    for (const t of p.tasks) {
      counts[t.status] += 1
      if (t.status !== 'done' && t.status !== 'cancelled') {
        active += 1
        if (t.deadlineAt < now) overdue += 1
      }
      if (t.assigneeId === user.id) mine += 1
      if (t.assigneeId === null) unassigned += 1
    }

    return {
      id: p.id,
      name: p.name,
      bannerColor: p.bannerColor,
      bannerUrl: bannerUrlFor({ id: p.id, bannerKey: p.bannerKey }),
      isActive: p.isActive,
      total: p.tasks.length,
      active,
      overdue,
      mine,
      unassigned,
      counts,
    }
  })

  return NextResponse.json({ projects: items })
}
