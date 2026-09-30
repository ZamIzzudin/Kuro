// GET /api/subtasks/available — subtask yang boleh dikerjakan freelancer.
// Hanya task di SPRINT AKTIF (backlog di luar scope), dan subtask belum done/cancelled
// yang berada dalam jangkauan user (miliknya / bucket bersama).
import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { SUBTASK_INCLUDE, mapSubtask, freelancerSubtaskScope } from '@/lib/tasks'

export async function GET(req: Request) {
  const { user, error } = await requireApiUser()
  if (error) return error

  const sp = new URL(req.url).searchParams
  const projectId = sp.get('projectId')

  const where: Prisma.SubtaskWhereInput = {
    status: { notIn: ['done', 'cancelled'] },
    task: { sprint: { status: 'active' } },
  }

  if (user.role === 'freelancer') {
    Object.assign(where, freelancerSubtaskScope(user.id))
  }
  if (projectId && projectId !== 'all') where.task = { ...(where.task as object), projectId }

  const rows = await db.subtask.findMany({
    where,
    include: {
      ...SUBTASK_INCLUDE,
      task: {
        include: {
          project: { select: { id: true, name: true } },
          workType: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true } },
          sprint: { select: { id: true, name: true, status: true } },
        },
      },
    },
    orderBy: [{ task: { priority: 'asc' } }, { position: 'asc' }],
  })

  const subtasks = rows.map((s) => ({
    ...mapSubtask(s),
    task: {
      id: s.task.id,
      title: s.task.title,
      priority: s.task.priority,
      deadlineAt: s.task.deadlineAt.toISOString(),
      overdue: s.task.deadlineAt < new Date() && s.task.status !== 'done' && s.task.status !== 'cancelled',
      project: s.task.project,
      workType: s.task.workType,
      requester: s.task.requester,
      sprint: s.task.sprint,
    },
  }))

  return NextResponse.json({ subtasks })
}
