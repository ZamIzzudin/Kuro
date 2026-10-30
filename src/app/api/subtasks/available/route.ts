// GET /api/subtasks/available — subtask yang boleh dilihat/dikerjakan freelancer.
//
// Query:
// - projectId  : batasi ke satu project ('all'/kosong = semua)
// - scope      : 'active' (default) = sprint aktif; 'backlog' = di luar sprint
// - includeDone: '1' = ikutkan subtask Done (dipakai papan kanban bucket)
//
// Scope freelancer (rule #12): hanya subtask miliknya ATAU subtask unassigned yang
// boleh ia ambil (task di pool assignee-nya / project tempat ia member). Subtask milik
// freelancer lain TIDAK pernah muncul di sini.
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
  const scope = sp.get('scope') === 'backlog' ? 'backlog' : 'active'
  const includeDone = sp.get('includeDone') === '1'

  const taskFilter: Prisma.TaskWhereInput = {
    ...(scope === 'backlog' ? { sprintId: null } : { sprint: { status: 'active' } }),
  }

  if (projectId && projectId !== 'all') taskFilter.projectId = projectId

  const where: Prisma.SubtaskWhereInput = {
    status: includeDone ? {} : { notIn: ['done'] },
    task: taskFilter,
  }

  if (user.role === 'freelancer') {
    Object.assign(where, freelancerSubtaskScope(user.id))
  }

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

  const now = new Date()
  const subtasks = rows.map((s) => ({
    ...mapSubtask(s),
    task: {
      id: s.task.id,
      title: s.task.title,
      priority: s.task.priority,
      status: s.task.status,
      deadlineAt: s.task.deadlineAt.toISOString(),
      overdue: s.task.deadlineAt < now && s.task.status !== 'done',
      revisionNote: s.task.revisionNote,
      project: s.task.project,
      workType: s.task.workType,
      requester: s.task.requester,
      sprint: s.task.sprint,
    },
  }))

  return NextResponse.json({ subtasks })
}
