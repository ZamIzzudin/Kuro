// GET /api/tasks/available — task yang boleh dipilih freelancer untuk clock in (rule #1, #3, #12)
// Sama seperti GET /api/tasks, tapi hanya task yang belum selesai & bisa dikerjakan user.
import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { TASK_INCLUDE, mapTask, sortTasks, freelancerTaskScope } from '@/lib/tasks'

export async function GET(req: Request) {
  const { user, error } = await requireApiUser()
  if (error) return error

  const where: Prisma.TaskWhereInput = { status: { notIn: ['done', 'cancelled'] } }

  // Rule #12 + enhancement project: miliknya, atau bucket bersama di project yang dia ikuti
  if (user.role === 'freelancer') {
    Object.assign(where, freelancerTaskScope(user.id))
  }

  // Filter opsional per project (dropdown project di sidebar)
  const projectId = new URL(req.url).searchParams.get('projectId')
  if (projectId && projectId !== 'all') where.projectId = projectId

  const tasks = await db.task.findMany({ where, include: TASK_INCLUDE })
  return NextResponse.json({ tasks: sortTasks(tasks.map(mapTask)) })
}
