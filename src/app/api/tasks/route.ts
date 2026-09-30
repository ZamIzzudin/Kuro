// /api/tasks — GET (semua login; freelancer: dalam scope-nya) & POST (admin)
// Hierarki baru: task punya banyak assignee (TaskAssignee) & banyak subtask.
import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { createTaskAttachments } from '@/lib/attachments'
import { mapTask, sortTasks, TASK_INCLUDE, freelancerTaskScope } from '@/lib/tasks'
import { recordSprintJoin } from '@/lib/sprints'
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
  const sprintId = sp.get('sprintId')
  const assigneeId = sp.get('assigneeId')
  const overdue = sp.get('overdue') === 'true'

  const where: Prisma.TaskWhereInput = {}

  // Scope (rule #12): freelancer hanya task dalam jangkauannya.
  if (user.role === 'freelancer') {
    Object.assign(where, freelancerTaskScope(user.id))
  } else if (assigneeId === 'unassigned') {
    where.assignees = { none: {} }
  } else if (assigneeId && assigneeId !== 'all') {
    where.assignees = { some: { userId: assigneeId } }
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
  // Filter sprint: 'backlog' = tanpa sprint; 'active' = sprint aktif di project; id = sprint tertentu
  if (sprintId === 'backlog') where.sprintId = null
  else if (sprintId === 'active') where.sprint = { status: 'active' }
  else if (sprintId && sprintId !== 'all') where.sprintId = sprintId
  if (overdue) where.deadlineAt = { lt: new Date() }

  const tasks = await db.task.findMany({ where, include: TASK_INCLUDE })
  return NextResponse.json({ tasks: sortTasks(tasks.map((t) => mapTask(t))) })
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
    sprintId,
    workTypeId,
    requesterId,
    assigneeIds,
    priority,
    estimatedHours,
    requestDateLocal,
    deadlineLocal,
    attachments,
    subtasks,
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

  // Sprint (opsional) harus milik project yang sama
  if (sprintId) {
    const sprint = await db.sprint.findUnique({ where: { id: sprintId } })
    if (!sprint || sprint.projectId !== projectId) {
      return NextResponse.json({ error: 'Sprint tidak ditemukan pada project ini.' }, { status: 400 })
    }
  }

  const uniqueAssignees = Array.from(new Set(assigneeIds ?? []))
  if (uniqueAssignees.length) {
    const found = await db.user.count({
      where: { id: { in: uniqueAssignees }, role: 'freelancer', isActive: true },
    })
    if (found !== uniqueAssignees.length) {
      return NextResponse.json({ error: 'Assignee harus freelancer aktif.' }, { status: 400 })
    }
  }

  // Assignee subtask harus berada di antara pool assignee task (bila ditentukan)
  const subtaskAssigneeIds = Array.from(
    new Set(subtasks.map((s) => s.assigneeId).filter((v): v is string => !!v))
  )
  if (subtaskAssigneeIds.length) {
    const found = await db.user.count({
      where: { id: { in: subtaskAssigneeIds }, role: 'freelancer', isActive: true },
    })
    if (found !== subtaskAssigneeIds.length) {
      return NextResponse.json({ error: 'Assignee subtask harus freelancer aktif.' }, { status: 400 })
    }
    if (uniqueAssignees.length) {
      const outside = subtaskAssigneeIds.filter((id) => !uniqueAssignees.includes(id))
      if (outside.length) {
        return NextResponse.json(
          { error: 'Assignee subtask harus termasuk dalam daftar assignee task.' },
          { status: 400 }
        )
      }
    }
  }

  const deadlineAt = wibLocalToDate(deadlineLocal)

  const created = await db.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title,
        description: description || null,
        projectId,
        sprintId: sprintId || null,
        workTypeId,
        requesterId,
        priority,
        estimatedHours: estimatedHours ?? null,
        requestDate: dateOnlyUTC(requestDateLocal),
        deadlineAt,
        createdById: admin.id,
        ...(uniqueAssignees.length
          ? { assignees: { create: uniqueAssignees.map((userId) => ({ userId })) } }
          : {}),
        subtasks: {
          create: subtasks.map((s, i) => ({
            title: s.title,
            description: s.description || null,
            assigneeId: s.assigneeId || null,
            estimatedHours: s.estimatedHours ?? null,
            position: s.position ?? i,
          })),
        },
      },
      include: TASK_INCLUDE,
    })
    if (attachments?.length) {
      await createTaskAttachments(tx, task.id, admin.id, attachments)
    }
    await recordSprintJoin(tx, task.id, task.sprintId)
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
      sprintId: sprintId || null,
      workTypeId,
      requesterId,
      assigneeIds: uniqueAssignees,
      priority,
      estimatedHours: estimatedHours ?? null,
      requestDate: requestDateLocal,
      deadlineAt: created.deadlineAt,
      attachmentCount: attachments?.length ?? 0,
      subtaskCount: subtasks.length,
    },
    description: `${admin.name} membuat task "${title}"`,
  })
  if (uniqueAssignees.length) {
    await logActivity({
      userId: admin.id,
      action: 'task_assigned',
      entityType: 'task',
      entityId: created.id,
      newValue: { assigneeIds: uniqueAssignees },
      description: `Task "${title}" di-assign ke ${created.assignees.map((a) => a.user.name).join(', ')}`,
    })
  }

  return NextResponse.json({ task: mapTask(created) }, { status: 201 })
}
