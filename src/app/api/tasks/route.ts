// /api/tasks — GET (semua login; freelancer: miliknya + unassigned) & POST (admin)
import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { createTaskAttachments } from '@/lib/attachments'
import { mapTask, sortTasks, TASK_INCLUDE, freelancerTaskScope } from '@/lib/tasks'
import { dateOnlyUTC, wibLocalToDate } from '@/lib/time'
import { taskCreateSchema } from '@/lib/validators'

export async function GET(req: Request) {
  const { user, error } = await requireApiUser()
  if (error) return error

  const sp = new URL(req.url).searchParams
  const status = sp.get('status')
  const projectId = sp.get('projectId')
  const workTypeId = sp.get('workTypeId')
  const requesterId = sp.get('requesterId')
  const priority = sp.get('priority')
  const assigneeId = sp.get('assigneeId')
  const overdue = sp.get('overdue') === 'true'

  const where: Prisma.TaskWhereInput = {}

  // Scope (rule #12 + enhancement project): freelancer hanya miliknya + bucket
  // bersama (unassigned) di project tempat ia menjadi member.
  if (user.role === 'freelancer') {
    Object.assign(where, freelancerTaskScope(user.id))
  } else if (assigneeId === 'unassigned') {
    where.assigneeId = null
  } else if (assigneeId) {
    where.assigneeId = assigneeId
  }

  if (status && status !== 'all') {
    where.status = status as Prisma.EnumTaskStatusFilter['equals']
  } else if (overdue) {
    where.status = { notIn: ['done', 'cancelled'] }
  }
  if (projectId && projectId !== 'all') where.projectId = projectId
  if (workTypeId && workTypeId !== 'all') where.workTypeId = workTypeId
  if (requesterId && requesterId !== 'all') where.requesterId = requesterId
  if (priority && priority !== 'all') {
    where.priority = priority as Prisma.EnumPriorityFilter['equals']
  }
  if (overdue) where.deadlineAt = { lt: new Date() }

  const tasks = await db.task.findMany({ where, include: TASK_INCLUDE })
  return NextResponse.json({ tasks: sortTasks(tasks.map(mapTask)) })
}

export async function POST(req: Request) {
  const { user: admin, error } = await requireApiUser(['admin'])
  if (error) return error

  const parsed = await parseJson(req, taskCreateSchema)
  if (parsed.error) return parsed.error
  const {
    title,
    description,
    projectId,
    workTypeId,
    requesterId,
    assigneeId,
    priority,
    estimatedHours,
    requestDateLocal,
    deadlineLocal,
    attachments,
  } = parsed.data

  // Validasi referensi harus ada & aktif
  const [project, workType, requester] = await Promise.all([
    db.project.findUnique({ where: { id: projectId } }),
    db.workType.findUnique({ where: { id: workTypeId } }),
    db.requester.findUnique({ where: { id: requesterId } }),
  ])
  if (!project?.isActive) return NextResponse.json({ error: 'Project tidak ditemukan/nonaktif.' }, { status: 400 })
  if (!workType?.isActive)
    return NextResponse.json({ error: 'Jenis pekerjaan tidak ditemukan/nonaktif.' }, { status: 400 })
  if (!requester?.isActive)
    return NextResponse.json({ error: 'Requester tidak ditemukan/nonaktif.' }, { status: 400 })

  if (assigneeId) {
    const assignee = await db.user.findUnique({ where: { id: assigneeId } })
    if (!assignee || assignee.role !== 'freelancer' || !assignee.isActive) {
      return NextResponse.json({ error: 'Assignee harus freelancer aktif.' }, { status: 400 })
    }
  }

  const created = await db.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title,
        description: description || null,
        projectId,
        workTypeId,
        requesterId,
        assigneeId: assigneeId || null,
        priority,
        estimatedHours: estimatedHours ?? null,
        requestDate: dateOnlyUTC(requestDateLocal),
        deadlineAt: wibLocalToDate(deadlineLocal),
        createdById: admin.id,
      },
      include: TASK_INCLUDE,
    })
    if (attachments?.length) {
      await createTaskAttachments(tx, task.id, admin.id, attachments)
    }
    // Ambil ulang agar lampiran ikut ter-mapping
    return tx.task.findUniqueOrThrow({ where: { id: task.id }, include: TASK_INCLUDE })
  }, TX_OPTIONS)

  await logActivity({
    userId: admin.id,
    action: 'task_created',
    entityType: 'task',
    entityId: created.id,
    newValue: {
      title,
      projectId,
      workTypeId,
      requesterId,
      assigneeId: assigneeId || null,
      priority,
      estimatedHours: estimatedHours ?? null,
      requestDate: requestDateLocal,
      deadlineAt: created.deadlineAt,
      attachmentCount: attachments?.length ?? 0,
    },
    description: `${admin.name} membuat task "${title}"`,
  })
  if (assigneeId) {
    await logActivity({
      userId: admin.id,
      action: 'task_assigned',
      entityType: 'task',
      entityId: created.id,
      newValue: { assigneeId },
      description: `Task "${title}" di-assign ke ${created.assignee?.name ?? assigneeId}`,
    })
  }

  return NextResponse.json({ task: mapTask(created) }, { status: 201 })
}
