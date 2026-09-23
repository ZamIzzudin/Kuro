// /api/projects/overview — daftar project + statistik task (untuk UI per-project)
// Admin: semua project. Freelancer: hanya project yang punya task miliknya/bucket bersama (rule #12).
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import type { ProjectOverview } from '@/lib/tasks'

export async function GET() {
  const { user, error } = await requireApiUser()
  if (error) return error

  // Scope task sesuai role
  const taskScope =
    user.role === 'freelancer'
      ? { OR: [{ assigneeId: user.id }, { assigneeId: null }] }
      : {}

  const projects = await db.project.findMany({
    where: user.role === 'freelancer' ? { isActive: true, tasks: { some: taskScope } } : undefined,
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

    const countable = p.tasks.length - counts.cancelled
    const progressPct = countable > 0 ? Math.round((counts.done / countable) * 100) : 0

    return {
      id: p.id,
      name: p.name,
      isActive: p.isActive,
      total: p.tasks.length,
      active,
      overdue,
      mine,
      unassigned,
      progressPct,
      counts,
    }
  })

  return NextResponse.json({ projects: items })
}
