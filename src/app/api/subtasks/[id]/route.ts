// /api/subtasks/:id — GET (detail, scoped) & PATCH (admin & project manager: judul/deskripsi/assignee/estimasi/lampiran)
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { ADMIN_ROLES } from '@/lib/roles'
import { createSubtaskAttachments } from '@/lib/attachments'
import { SUBTASK_INCLUDE, mapSubtask, freelancerSubtaskScope } from '@/lib/tasks'
import { syncTaskStatusFromSubtasks } from '@/lib/task-status'
import { STATUS_LABEL } from '@/lib/time-entries'
import { removeObject } from '@/lib/storage'
import { subtaskUpdateSchema } from '@/lib/validators'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireApiUser()
  if (error) return error

  const where =
    user.role === 'freelancer'
      ? { AND: [{ id: params.id }, freelancerSubtaskScope(user.id)] }
      : { id: params.id }

  const subtask = await db.subtask.findFirst({
    where,
    include: {
      ...SUBTASK_INCLUDE,
      task: {
        include: {
          project: { select: { id: true, name: true } },
          workType: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true } },
          sprint: { select: { id: true, name: true, status: true } },
          assignees: { select: { userId: true } },
        },
      },
    },
  })
  if (!subtask) return NextResponse.json({ error: 'Subtask tidak ditemukan.' }, { status: 404 })

  const t = subtask.task
  return NextResponse.json({
    subtask: {
      ...mapSubtask(subtask),
      task: {
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        deadlineAt: t.deadlineAt.toISOString(),
        overdue: t.deadlineAt < new Date() && t.status !== 'done',
        project: t.project,
        workType: t.workType,
        requester: t.requester,
        sprint: t.sprint,
      },
    },
  })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(ADMIN_ROLES)
  if (error) return error

  const parsed = await parseJson(req, subtaskUpdateSchema)
  if (parsed.error) return parsed.error
  const body = parsed.data

  const before = await db.subtask.findUnique({ where: { id: params.id } })
  if (!before) return NextResponse.json({ error: 'Subtask tidak ditemukan.' }, { status: 404 })

  if (body.assigneeId) {
    const a = await db.user.findUnique({ where: { id: body.assigneeId } })
    if (!a || a.role !== 'freelancer' || !a.isActive) {
      return NextResponse.json({ error: 'Assignee harus freelancer aktif.' }, { status: 400 })
    }
  }

  const removeAttachmentIds = body.removeAttachmentIds ?? []
  let attachmentsToRemove: { id: string; objectKey: string }[] = []
  if (removeAttachmentIds.length) {
    attachmentsToRemove = await db.subtaskAttachment.findMany({
      where: { id: { in: removeAttachmentIds }, subtaskId: params.id },
      select: { id: true, objectKey: true },
    })
  }

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description || null
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null
  if (body.estimatedHours !== undefined) data.estimatedHours = body.estimatedHours ?? null
  if (body.position !== undefined) data.position = body.position
  if (body.status !== undefined) data.status = body.status

  const taskBefore = await db.task.findUnique({ where: { id: before.taskId }, select: { status: true } })

  const { updated, taskStatus } = await db.$transaction(async (tx) => {
    await tx.subtask.update({ where: { id: params.id }, data })
    if (attachmentsToRemove.length) {
      await tx.subtaskAttachment.deleteMany({ where: { id: { in: attachmentsToRemove.map((a) => a.id) } } })
    }
    if (body.addAttachments?.length) {
      await createSubtaskAttachments(tx, params.id, admin.id, body.addAttachments)
    }
    // Perubahan status subtask menurunkan ulang status task induk.
    const taskStatus = await syncTaskStatusFromSubtasks(tx, before.taskId)
    const updated = await tx.subtask.findUniqueOrThrow({ where: { id: params.id }, include: SUBTASK_INCLUDE })
    return { updated, taskStatus }
  }, TX_OPTIONS)

  await Promise.all(attachmentsToRemove.map((a) => removeObject(a.objectKey)))

  await logActivity({
    userId: admin.id,
    action: 'subtask_updated',
    entityType: 'subtask',
    entityId: updated.id,
    oldValue: { title: before.title, assigneeId: before.assigneeId, estimatedHours: before.estimatedHours, status: before.status },
    newValue: { title: updated.title, assigneeId: updated.assigneeId, estimatedHours: updated.estimatedHours, status: updated.status },
    description: `${admin.name} mengubah subtask "${before.title}"`,
  })

  if (taskStatus && taskBefore && taskStatus !== taskBefore.status) {
    await logActivity({
      userId: admin.id,
      action: 'task_status_changed',
      entityType: 'task',
      entityId: before.taskId,
      oldValue: { taskStatus: taskBefore.status },
      newValue: { taskStatus },
      description: `Status task induk otomatis mengikuti subtask: ${STATUS_LABEL[taskBefore.status]} → ${STATUS_LABEL[taskStatus]}`,
    })
  }

  return NextResponse.json({ subtask: mapSubtask(updated) })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(ADMIN_ROLES)
  if (error) return error

  const subtask = await db.subtask.findUnique({
    where: { id: params.id },
    include: { _count: { select: { timeEntries: true } } },
  })
  if (!subtask) return NextResponse.json({ error: 'Subtask tidak ditemukan.' }, { status: 404 })
  if (subtask._count.timeEntries > 0) {
    return NextResponse.json(
      { error: 'Subtask sudah memiliki catatan jam kerja — tidak bisa dihapus.' },
      { status: 409 }
    )
  }

  await db.$transaction(async (tx) => {
    await tx.subtask.delete({ where: { id: params.id } })
    // Menghapus subtask bisa mengubah status task (mis. subtask terakhir yang tersisa).
    await syncTaskStatusFromSubtasks(tx, subtask.taskId)
  }, TX_OPTIONS)
  await logActivity({
    userId: admin.id,
    action: 'subtask_deleted',
    entityType: 'subtask',
    entityId: params.id,
    oldValue: { title: subtask.title, taskId: subtask.taskId },
    description: `${admin.name} menghapus subtask "${subtask.title}"`,
  })
  return NextResponse.json({ ok: true })
}
