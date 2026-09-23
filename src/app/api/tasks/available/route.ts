// GET /api/tasks/available — task yang boleh dipilih freelancer untuk clock in (rule #1, #3, #12)
// Sama seperti GET /api/tasks, tapi hanya task yang belum selesai & bisa dikerjakan user.
import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { TASK_INCLUDE, mapTask, sortTasks } from '@/lib/tasks'

export async function GET() {
  const { user, error } = await requireApiUser()
  if (error) return error

  const where: Prisma.TaskWhereInput = { status: { notIn: ['done', 'cancelled'] } }

  // Rule #12: miliknya + bucket bersama
  if (user.role === 'freelancer') {
    where.OR = [{ assigneeId: user.id }, { assigneeId: null }]
  }

  const tasks = await db.task.findMany({ where, include: TASK_INCLUDE })
  return NextResponse.json({ tasks: sortTasks(tasks.map(mapTask)) })
}
