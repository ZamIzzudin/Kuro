// POST /api/tasks/:id/revisions — buat task REVISI dari task yang sudah done/review.
//
// Aturan konsep "Revisi":
// - Aksi ini TIDAK mengubah status task lama menjadi sebuah status "revisi".
// - Sebagai gantinya dibuat Task BARU dengan flag `isRevision`, menyalin detail
//   task lama apa adanya (judul, deskripsi, assignee, subtask) — admin yang
//   kemudian mengubah detail yang perlu direvisi.
// - Task baru berstatus `todo` agar bisa diambil pada sprint berikutnya.
// - Task lama tetap `done` (bila tadinya `review` → dinaikkan menjadi `done`),
//   sehingga jejak task yang minta revisi tetap terjaga.
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { findTask, mapTask, TASK_INCLUDE } from '@/lib/tasks'
import { closeSprintMembership, recordSprintJoin } from '@/lib/sprints'
import { taskRevisionSchema } from '@/lib/validators'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(['admin'])
  if (error) return error

  const parsed = await parseJson(req, taskRevisionSchema)
  if (parsed.error) return parsed.error
  const { note, sprintId } = parsed.data

  const source = await findTask(params.id)
  if (!source) return NextResponse.json({ error: 'Task tidak ditemukan.' }, { status: 404 })

  // Hanya task yang sudah done/review yang bisa direvisi.
  if (source.status !== 'done' && source.status !== 'review') {
    return NextResponse.json(
      { error: 'Revisi hanya bisa dibuat untuk task berstatus Done atau Review.' },
      { status: 400 }
    )
  }

  // Sprint tujuan (opsional) harus berada di project yang sama.
  if (sprintId) {
    const sprint = await db.sprint.findUnique({ where: { id: sprintId } })
    if (!sprint || sprint.projectId !== source.projectId) {
      return NextResponse.json({ error: 'Sprint tidak ditemukan pada project ini.' }, { status: 400 })
    }
  }

  const created = await db.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: source.title,
        description: source.description,
        projectId: source.projectId,
        sprintId: sprintId || null,
        workTypeId: source.workTypeId,
        requesterId: source.requesterId,
        requestDate: source.requestDate,
        priority: source.priority,
        deadlineAt: source.deadlineAt,
        estimatedHours: source.estimatedHours,
        status: 'todo',
        isRevision: true,
        revisionOfId: source.id,
        revisionNote: note || null,
        createdById: admin.id,
        ...(source.assignees.length
          ? { assignees: { create: source.assignees.map((a) => ({ userId: a.userId })) } }
          : {}),
        subtasks: {
          create: source.subtasks.map((s) => ({
            title: s.title,
            description: s.description,
            assigneeId: s.assigneeId,
            estimatedHours: s.estimatedHours,
            position: s.position,
            status: 'todo',
          })),
        },
      },
      include: TASK_INCLUDE,
    })

    // Task asal yang tadinya review → naikkan ke done & tutup keanggotaan sprint.
    if (source.status === 'review') {
      await tx.task.update({ where: { id: source.id }, data: { status: 'done' } })
      await closeSprintMembership(tx, source.id, 'completed', 'done')
    }

    await recordSprintJoin(tx, task.id, task.sprintId)
    return tx.task.findUniqueOrThrow({ where: { id: task.id }, include: TASK_INCLUDE })
  }, TX_OPTIONS)

  await logActivity({
    userId: admin.id,
    action: 'task_revision_created',
    entityType: 'task',
    entityId: created.id,
    newValue: {
      revisionOfId: source.id,
      revisionOfTitle: source.title,
      title: created.title,
      sprintId: created.sprintId,
      note: note || null,
      subtaskCount: created.subtasks.length,
    },
    description: `${admin.name} membuat revisi dari task "${source.title}"`,
  })

  return NextResponse.json({ task: mapTask(created) }, { status: 201 })
}
