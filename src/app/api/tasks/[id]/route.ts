// /api/tasks/:id — GET (detail task, semua login) & PATCH (admin: edit lengkap, assign/re-assign, set status incl. Cancelled)
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { createTaskAttachments } from '@/lib/attachments'
import { findTask, mapTask, TASK_INCLUDE, freelancerTaskScope } from '@/lib/tasks'
import { removeObject } from '@/lib/storage'
import { dateOnlyUTC, wibLocalToDate } from '@/lib/time'
import { taskUpdateSchema } from '@/lib/validators'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireApiUser()
  if (error) return error

  // Rule #12: freelancer hanya boleh membuka detail task dalam scope-nya.
  const where =
    user.role === 'freelancer'
      ? { AND: [{ id: params.id }, freelancerTaskScope(user.id)] }
      : { id: params.id }

  const task = await db.task.findFirst({ where, include: TASK_INCLUDE })
  if (!task) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 })
  return NextResponse.json({ task: mapTask(task) })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(['admin'])
  if (error) return error

  const parsed = await parseJson(req, taskUpdateSchema)
  if (parsed.error) return parsed.error
  const body = parsed.data

  const before = await findTask(params.id)
  if (!before) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 })

  // Validasi referensi yang berubah
  if (body.projectId) {
    const p = await db.project.findUnique({ where: { id: body.projectId } })
    if (!p?.isActive) return NextResponse.json({ error: 'Project tidak ditemukan/nonaktif.' }, { status: 400 })
  }
  if (body.workTypeId) {
    const w = await db.workType.findUnique({ where: { id: body.workTypeId } })
    if (!w?.isActive)
      return NextResponse.json({ error: 'Jenis pekerjaan tidak ditemukan/nonaktif.' }, { status: 400 })
  }
  if (body.requesterId) {
    const r = await db.requester.findUnique({ where: { id: body.requesterId } })
    if (!r || !r.isActive)
      return NextResponse.json({ error: 'Requester tidak ditemukan/nonaktif.' }, { status: 400 })
  }
  let assigneeName: string | null = null
  if (body.assigneeId) {
    const a = await db.user.findUnique({ where: { id: body.assigneeId } })
    if (!a || a.role !== 'freelancer' || !a.isActive) {
      return NextResponse.json({ error: 'Assignee harus freelancer aktif.' }, { status: 400 })
    }
    assigneeName = a.name
  }

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description || null
  if (body.projectId !== undefined) data.projectId = body.projectId
  if (body.workTypeId !== undefined) data.workTypeId = body.workTypeId
  if (body.requesterId !== undefined) data.requesterId = body.requesterId
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null
  if (body.priority !== undefined) data.priority = body.priority
  if (body.estimatedHours !== undefined) data.estimatedHours = body.estimatedHours ?? null
  if (body.requestDateLocal !== undefined) data.requestDate = dateOnlyUTC(body.requestDateLocal)
  if (body.deadlineLocal !== undefined) data.deadlineAt = wibLocalToDate(body.deadlineLocal)
  if (body.status !== undefined) data.status = body.status

  const addAttachments = body.addAttachments ?? []
  const removeAttachmentIds = body.removeAttachmentIds ?? []

  // Validasi lampiran yang akan dihapus memang milik task ini (cegah hapus silang).
  let attachmentsToRemove: { id: string; objectKey: string; fileName: string }[] = []
  if (removeAttachmentIds.length) {
    attachmentsToRemove = await db.taskAttachment.findMany({
      where: { id: { in: removeAttachmentIds }, taskId: params.id },
      select: { id: true, objectKey: true, fileName: true },
    })
  }

  const updated = await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id: params.id }, data })
    if (attachmentsToRemove.length) {
      await tx.taskAttachment.deleteMany({ where: { id: { in: attachmentsToRemove.map((a) => a.id) } } })
    }
    if (addAttachments.length) {
      await createTaskAttachments(tx, params.id, admin.id, addAttachments)
    }
    return tx.task.findUniqueOrThrow({ where: { id: params.id }, include: TASK_INCLUDE })
  }, TX_OPTIONS)

  // Hapus objek lama di storage setelah transaksi sukses (best-effort).
  await Promise.all(attachmentsToRemove.map((a) => removeObject(a.objectKey)))

  const assigneeChanged = body.assigneeId !== undefined && (body.assigneeId || null) !== before.assigneeId

  await logActivity({
    userId: admin.id,
    action: 'task_updated',
    entityType: 'task',
    entityId: updated.id,
    oldValue: {
      title: before.title,
      projectId: before.projectId,
      workTypeId: before.workTypeId,
      requesterId: before.requesterId,
      assigneeId: before.assigneeId,
      priority: before.priority,
      estimatedHours: before.estimatedHours,
      status: before.status,
      deadlineAt: before.deadlineAt,
    },
    newValue: {
      title: updated.title,
      projectId: updated.projectId,
      workTypeId: updated.workTypeId,
      requesterId: updated.requesterId,
      assigneeId: updated.assigneeId,
      priority: updated.priority,
      estimatedHours: updated.estimatedHours,
      status: updated.status,
      deadlineAt: updated.deadlineAt,
    },
    description: `${admin.name} mengubah task "${before.title}"`,
  })
  if (addAttachments.length || attachmentsToRemove.length) {
    await logActivity({
      userId: admin.id,
      action: 'task_updated',
      entityType: 'task',
      entityId: updated.id,
      newValue: {
        attachmentsAdded: addAttachments.map((a) => a.fileName),
        attachmentsRemoved: attachmentsToRemove.map((a) => a.fileName),
      },
      description: `${admin.name} memperbarui lampiran task "${before.title}"`,
    })
  }
  if (assigneeChanged && updated.assigneeId) {
    await logActivity({
      userId: admin.id,
      action: 'task_assigned',
      entityType: 'task',
      entityId: updated.id,
      oldValue: { assigneeId: before.assigneeId },
      newValue: { assigneeId: updated.assigneeId },
      description: `Task "${updated.title}" di-assign ke ${assigneeName ?? updated.assignee?.name}`,
    })
  }

  return NextResponse.json({ task: mapTask(updated) })
}
