// /api/sprints/:id/tasks — kelola keanggotaan task pada sprint (tambah dari Backlog / keluarkan).
// Task selalu dibuat di Backlog; masuk sprint hanya lewat sini (termasuk sprint `planned`).
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { ADMIN_ROLES } from '@/lib/roles'
import { closeSprintMembership, findSprint, recordSprintJoin } from '@/lib/sprints'
import { sprintTasksSchema } from '@/lib/validators'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(ADMIN_ROLES)
  if (error) return error

  const parsed = await parseJson(req, sprintTasksSchema)
  if (parsed.error) return parsed.error
  const addTaskIds = Array.from(new Set(parsed.data.addTaskIds ?? []))
  const removeTaskIds = Array.from(new Set(parsed.data.removeTaskIds ?? []))

  const sprint = await findSprint(params.id)
  if (!sprint) return NextResponse.json({ error: 'Sprint tidak ditemukan.' }, { status: 404 })
  if (sprint.status === 'completed') {
    return NextResponse.json(
      { error: 'Sprint sudah selesai — tidak bisa diubah lagi.' },
      { status: 400 }
    )
  }

  // Validasi: task harus ada di project yang sama.
  const ids = [...addTaskIds, ...removeTaskIds]
  const found = await db.task.findMany({
    where: { id: { in: ids } },
    select: { id: true, projectId: true, title: true, sprintId: true },
  })
  if (found.length !== ids.length) {
    return NextResponse.json({ error: 'Ada task yang tidak ditemukan.' }, { status: 400 })
  }
  if (found.some((t) => t.projectId !== sprint.projectId)) {
    return NextResponse.json({ error: 'Task harus berada di project yang sama dengan sprint.' }, { status: 400 })
  }

  const toAdd = found.filter((t) => addTaskIds.includes(t.id))
  const toRemove = found.filter((t) => removeTaskIds.includes(t.id))
  const now = new Date()

  await db.$transaction(async (tx) => {
    for (const t of toAdd) {
      if (t.sprintId === sprint.id) continue
      if (t.sprintId) await closeSprintMembership(tx, t.id, 'moved', null, now)
      await tx.task.update({ where: { id: t.id }, data: { sprintId: sprint.id } })
      await recordSprintJoin(tx, t.id, sprint.id, now)
    }
    for (const t of toRemove) {
      if (t.sprintId !== sprint.id) continue
      await closeSprintMembership(tx, t.id, 'removed', null, now)
      await tx.task.update({ where: { id: t.id }, data: { sprintId: null } })
    }
  }, TX_OPTIONS)

  if (toAdd.length) {
    await logActivity({
      userId: admin.id,
      action: 'sprint_tasks_added',
      entityType: 'sprint',
      entityId: sprint.id,
      newValue: { taskIds: toAdd.map((t) => t.id), titles: toAdd.map((t) => t.title) },
      description: `${admin.name} menambahkan ${toAdd.length} task ke sprint "${sprint.name}"`,
    })
  }
  if (toRemove.length) {
    await logActivity({
      userId: admin.id,
      action: 'sprint_tasks_removed',
      entityType: 'sprint',
      entityId: sprint.id,
      newValue: { taskIds: toRemove.map((t) => t.id), titles: toRemove.map((t) => t.title) },
      description: `${admin.name} mengeluarkan ${toRemove.length} task dari sprint "${sprint.name}"`,
    })
  }

  return NextResponse.json({ ok: true, added: toAdd.length, removed: toRemove.length })
}
