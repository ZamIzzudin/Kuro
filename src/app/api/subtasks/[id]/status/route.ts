// PATCH /api/subtasks/:id/status — freelancer mengubah status subtask dalam jangkauannya.
// Subtask unassigned → otomatis diklaim (rule #7). Done/Dibatalkan terkunci (hanya admin).
// Status task tidak lagi diubah dari sini — task adalah container.
import type { TaskStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { syncTaskStatusFromSubtasks } from '@/lib/task-status'
import { STATUS_LABEL } from '@/lib/time-entries'
import { subtaskStatusSchema } from '@/lib/validators'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireApiUser(['freelancer'])
  if (error) return error

  const parsed = await parseJson(req, subtaskStatusSchema)
  if (parsed.error) return parsed.error
  const { status } = parsed.data

  const subtask = await db.subtask.findUnique({
    where: { id: params.id },
    include: {
      task: {
        include: {
          sprint: { select: { status: true } },
          project: { select: { members: { select: { userId: true } } } },
          assignees: { select: { userId: true } },
        },
      },
    },
  })
  if (!subtask) return NextResponse.json({ error: 'Subtask tidak ditemukan.' }, { status: 404 })

  // Scope: subtask miliknya, atau bucket bersama (unassigned) yang boleh ia ambil.
  const inPool = subtask.task.assignees.some((a) => a.userId === user.id)
  const isMember = subtask.task.project.members.some((m) => m.userId === user.id)
  const mine = subtask.assigneeId === user.id
  const claimable = subtask.assigneeId === null && (inPool || isMember)
  if (!mine && !claimable) {
    return NextResponse.json({ error: 'Subtask ini tidak berada dalam jangkauan Anda.' }, { status: 403 })
  }

  // Hanya subtask di sprint aktif yang boleh dikerjakan.
  if (subtask.task.sprint?.status !== 'active') {
    return NextResponse.json(
      { error: 'Task ini belum masuk sprint aktif — hubungi admin.' },
      { status: 409 }
    )
  }

  if (subtask.status === 'done') {
    return NextResponse.json(
      { error: 'Subtask sudah selesai — status terkunci (hanya admin).' },
      { status: 400 }
    )
  }

  // Freelancer tidak boleh menetapkan `revision` langsung — status itu hanya
  // muncul lewat aksi Minta Revisi.
  if (status === 'revision') {
    return NextResponse.json({ error: 'Status tidak valid untuk freelancer.' }, { status: 400 })
  }

  const claimed = claimable
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.subtask.update({
      where: { id: params.id },
      data: {
        status: status as TaskStatus,
        ...(claimed ? { assigneeId: user.id } : {}),
      },
      include: { assignee: { select: { id: true, name: true } } },
    })
    // Status tugas induk mengikuti status subtask.
    await syncTaskStatusFromSubtasks(tx, subtask.taskId)
    return row
  }, TX_OPTIONS)

  if (claimed) {
    await logActivity({
      userId: user.id,
      action: 'subtask_claimed',
      entityType: 'subtask',
      entityId: updated.id,
      newValue: { assigneeId: user.id },
      description: `${user.name} mengklaim subtask "${subtask.title}"`,
    })
  }
  await logActivity({
    userId: user.id,
    action: 'subtask_status_changed',
    entityType: 'subtask',
    entityId: updated.id,
    oldValue: { status: subtask.status },
    newValue: { status },
    description: `${user.name} mengubah status subtask "${subtask.title}": ${STATUS_LABEL[subtask.status]} → ${STATUS_LABEL[status as TaskStatus]}`,
  })

  return NextResponse.json({ subtask: updated })
}
