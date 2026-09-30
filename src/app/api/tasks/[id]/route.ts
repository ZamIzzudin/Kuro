// /api/tasks/:id — GET (detail, semua login) & PATCH (admin: edit lengkap, multi-assignee,
// sinkronisasi subtask, pindah sprint, set status incl. Cancelled)
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { createTaskAttachments } from '@/lib/attachments'
import { findTask, mapTask, TASK_INCLUDE, freelancerTaskScope } from '@/lib/tasks'
import { closeSprintMembership, recordSprintJoin } from '@/lib/sprints'
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
  const nextProjectId = body.projectId ?? before.projectId
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
  if (body.sprintId) {
    const s = await db.sprint.findUnique({ where: { id: body.sprintId } })
    if (!s || s.projectId !== nextProjectId) {
      return NextResponse.json({ error: 'Sprint tidak ditemukan pada project ini.' }, { status: 400 })
    }
  }
  if (body.assigneeIds) {
    const ids = Array.from(new Set(body.assigneeIds))
    if (ids.length) {
      const found = await db.user.count({
        where: { id: { in: ids }, role: 'freelancer', isActive: true },
      })
      if (found !== ids.length) {
        return NextResponse.json({ error: 'Assignee harus freelancer aktif.' }, { status: 400 })
      }
    }
  }

  // Subtask: item tanpa id dibuat, dengan id diperbarui; yang tidak ada di daftar dihapus.
  const incoming = body.subtasks
  const keepIds = incoming ? incoming.filter((s) => s.id).map((s) => s.id as string) : []
  const existing = await db.subtask.findMany({
    where: { taskId: params.id },
    select: { id: true, _count: { select: { timeEntries: true } } },
  })
  const toRemove = incoming ? existing.filter((s) => !keepIds.includes(s.id)) : []
  const blocked = toRemove.filter((s) => s._count.timeEntries > 0)
  if (blocked.length) {
    return NextResponse.json(
      {
        error:
          'Ada subtask yang sudah memiliki catatan jam kerja sehingga tidak bisa dihapus. Keluarkan dari daftar hanya setelah time entry terkait dihapus.',
      },
      { status: 409 }
    )
  }

  const addAttachments = body.addAttachments ?? []
  const removeAttachmentIds = body.removeAttachmentIds ?? []
  let attachmentsToRemove: { id: string; objectKey: string; fileName: string }[] = []
  if (removeAttachmentIds.length) {
    attachmentsToRemove = await db.taskAttachment.findMany({
      where: { id: { in: removeAttachmentIds }, taskId: params.id },
      select: { id: true, objectKey: true, fileName: true },
    })
  }

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description || null
  if (body.projectId !== undefined) data.projectId = body.projectId
  if (body.sprintId !== undefined) data.sprintId = body.sprintId || null
  if (body.workTypeId !== undefined) data.workTypeId = body.workTypeId
  if (body.requesterId !== undefined) data.requesterId = body.requesterId
  if (body.priority !== undefined) data.priority = body.priority
  if (body.estimatedHours !== undefined) data.estimatedHours = body.estimatedHours ?? null
  if (body.requestDateLocal !== undefined) data.requestDate = dateOnlyUTC(body.requestDateLocal)
  if (body.deadlineLocal !== undefined) data.deadlineAt = wibLocalToDate(body.deadlineLocal)
  if (body.status !== undefined) data.status = body.status

  const sprintChanged = body.sprintId !== undefined && (body.sprintId || null) !== before.sprintId

  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id: params.id }, data })

    // Ganti pool assignee (bila field dikirim)
    if (body.assigneeIds) {
      const ids = Array.from(new Set(body.assigneeIds))
      await tx.taskAssignee.deleteMany({ where: { taskId: params.id } })
      if (ids.length) {
        await tx.taskAssignee.createMany({
          data: ids.map((userId) => ({ taskId: params.id, userId })),
          skipDuplicates: true,
        })
      }
    }

    // Sinkronisasi subtask
    if (incoming) {
      if (toRemove.length) {
        await tx.subtask.deleteMany({ where: { id: { in: toRemove.map((s) => s.id) } } })
      }
      for (let i = 0; i < incoming.length; i++) {
        const s = incoming[i]
        if (s.id) {
          await tx.subtask.update({
            where: { id: s.id },
            data: {
              title: s.title,
              description: s.description || null,
              assigneeId: s.assigneeId || null,
              estimatedHours: s.estimatedHours ?? null,
              position: s.position ?? i,
            },
          })
        } else {
          await tx.subtask.create({
            data: {
              taskId: params.id,
              title: s.title,
              description: s.description || null,
              assigneeId: s.assigneeId || null,
              estimatedHours: s.estimatedHours ?? null,
              position: s.position ?? i,
            },
          })
        }
      }
    }

    if (attachmentsToRemove.length) {
      await tx.taskAttachment.deleteMany({ where: { id: { in: attachmentsToRemove.map((a) => a.id) } } })
    }
    if (addAttachments.length) {
      await createTaskAttachments(tx, params.id, admin.id, addAttachments)
    }

    // Riwayat sprint: tutup keanggotaan lama & catat yang baru
    if (sprintChanged) {
      await closeSprintMembership(tx, params.id, body.sprintId ? 'moved' : 'removed')
      await recordSprintJoin(tx, params.id, body.sprintId)
    }

    // Task ditandai selesai langsung oleh admin → tutup keanggotaan sprint terbuka
    if (body.status === 'done' && before.status !== 'done' && !sprintChanged) {
      await closeSprintMembership(tx, params.id, 'completed', 'done')
    }
  }, TX_OPTIONS)

  const updated = await db.task.findUniqueOrThrow({ where: { id: params.id }, include: TASK_INCLUDE })

  // Hapus objek lama di storage setelah transaksi sukses (best-effort).
  await Promise.all(attachmentsToRemove.map((a) => removeObject(a.objectKey)))

  await logActivity({
    userId: admin.id,
    action: 'task_updated',
    entityType: 'task',
    entityId: updated.id,
    oldValue: {
      title: before.title,
      projectId: before.projectId,
      sprintId: before.sprintId,
      workTypeId: before.workTypeId,
      requesterId: before.requesterId,
      assigneeIds: before.assignees.map((a) => a.user.id),
      priority: before.priority,
      estimatedHours: before.estimatedHours,
      status: before.status,
      deadlineAt: before.deadlineAt,
    },
    newValue: {
      title: updated.title,
      projectId: updated.projectId,
      sprintId: updated.sprintId,
      workTypeId: updated.workTypeId,
      requesterId: updated.requesterId,
      assigneeIds: updated.assignees.map((a) => a.user.id),
      priority: updated.priority,
      estimatedHours: updated.estimatedHours,
      status: updated.status,
      deadlineAt: updated.deadlineAt,
      subtaskCount: updated.subtasks.length,
    },
    description: `${admin.name} mengubah task "${before.title}"`,
  })

  return NextResponse.json({ task: mapTask(updated) })
}
