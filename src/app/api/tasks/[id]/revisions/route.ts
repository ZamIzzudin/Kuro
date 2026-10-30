// POST /api/tasks/:id/revisions — Minta Revisi pada task (atau subtask terpilih).
//
// Konsep baru "Revisi":
// - TIDAK lagi membuat task baru. Task yang sama dikembalikan ke status `revision`.
// - Admin/PM/freelancer memilih SUBTASK mana yang dikembalikan menjadi `revision`;
//   subtask itulah yang nanti diambil ulang freelancer (bucket ikut menampilkan `revision`).
// - Task TETAP berada di sprint yang sama (tidak dipindah).
// - `revisionNote` menyimpan alasan revisi pada task.
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { findTask, mapTask, TASK_INCLUDE } from '@/lib/tasks'
import { markTaskRevision } from '@/lib/task-revision'
import { taskRevisionSchema } from '@/lib/validators'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireApiUser()
  if (error) return error

  const parsed = await parseJson(req, taskRevisionSchema)
  if (parsed.error) return parsed.error
  const { note, subtaskIds } = parsed.data

  const task = await findTask(params.id)
  if (!task) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 })

  if (user.role === 'freelancer') {
    const member = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: task.projectId, userId: user.id } },
      select: { id: true },
    })
    const assigned = task.assignees.some((a) => a.user.id === user.id)
    if (!member && !assigned) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }
  }

  const validSubtaskIds = task.subtasks.filter((s) => subtaskIds.includes(s.id)).map((s) => s.id)
  if (validSubtaskIds.length !== new Set(subtaskIds).size) {
    return NextResponse.json({ error: 'Ada subtask yang tidak ditemukan pada task ini.' }, { status: 400 })
  }

  const updated = await db.$transaction(
    async (tx) => markTaskRevision(tx, task.id, validSubtaskIds, note || null),
    TX_OPTIONS
  )

  await logActivity({
    userId: user.id,
    action: 'task_revision_requested',
    entityType: 'task',
    entityId: task.id,
    newValue: {
      title: task.title,
      sprintId: task.sprintId,
      subtaskIds: validSubtaskIds,
      note: note || null,
    },
    description: `${user.name} meminta revisi task "${task.title}" (${validSubtaskIds.length} subtask)`,
  })

  const withRelations = await db.task.findUniqueOrThrow({ where: { id: updated.id }, include: TASK_INCLUDE })
  return NextResponse.json({ task: mapTask(withRelations) }, { status: 201 })
}
