// /api/tasks/:id/status — PATCH (freelancer): ubah status task miliknya
// Transisi: todo → in_progress → review → done (boleh mundur, kecuali dari done/cancelled)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { findTask, mapTask, TASK_INCLUDE } from '@/lib/tasks'
import { taskStatusSchema } from '@/lib/validators'

const STATUS_LABEL: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireApiUser(['freelancer'])
  if (error) return error

  const parsed = await parseJson(req, taskStatusSchema)
  if (parsed.error) return parsed.error
  const { status } = parsed.data

  const task = await findTask(params.id)
  if (!task) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 })

  // Hanya task miliknya
  if (task.assigneeId !== user.id) {
    return NextResponse.json({ error: 'Bukan task milik Anda.' }, { status: 403 })
  }
  if (task.status === 'done' || task.status === 'cancelled') {
    return NextResponse.json(
      { error: `Task sudah ${task.status === 'done' ? 'selesai' : 'dibatalkan'} — status terkunci.` },
      { status: 400 }
    )
  }

  const updated = await db.task.update({
    where: { id: params.id },
    data: { status },
    include: TASK_INCLUDE,
  })

  await logActivity({
    userId: user.id,
    action: 'task_status_changed',
    entityType: 'task',
    entityId: updated.id,
    oldValue: { status: task.status },
    newValue: { status },
    description: `${user.name} mengubah status task "${task.title}": ${STATUS_LABEL[task.status] ?? task.status} → ${STATUS_LABEL[status] ?? status}`,
  })

  return NextResponse.json({ task: mapTask(updated) })
}
