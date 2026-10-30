// /api/sprints/:id — GET detail & PATCH (admin & project manager: ubah field / transisi status)
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { ADMIN_ROLES } from '@/lib/roles'
import { closeSprint, findSprint, mapSprint, SPRINT_INCLUDE, sprintCounts } from '@/lib/sprints'
import { dateOnlyUTC } from '@/lib/time'
import { sprintCompleteSchema, sprintUpdateSchema } from '@/lib/validators'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireApiUser()
  if (error) return error

  const sprint = await findSprint(params.id)
  if (!sprint) return NextResponse.json({ error: 'Sprint tidak ditemukan.' }, { status: 404 })

  if (user.role === 'freelancer') {
    const member = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: sprint.projectId, userId: user.id } },
      select: { id: true },
    })
    if (!member) return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
  }

  const counts = await sprintCounts([sprint.id])
  return NextResponse.json({ sprint: mapSprint(sprint, counts.get(sprint.id)) })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(ADMIN_ROLES)
  if (error) return error

  const parsed = await parseJson(req, sprintUpdateSchema)
  if (parsed.error) return parsed.error
  const body = parsed.data

  const before = await findSprint(params.id)
  if (!before) return NextResponse.json({ error: 'Sprint tidak ditemukan.' }, { status: 404 })

  const nextStart = body.startDate ? dateOnlyUTC(body.startDate) : before.startDate
  const nextEnd = body.endDate ? dateOnlyUTC(body.endDate) : before.endDate
  if (nextEnd < nextStart) {
    return NextResponse.json(
      { error: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' },
      { status: 400 }
    )
  }

  // Transisi status. Mengaktifkan sprint ditangani di sini (unique index parsial
  // menjaga hanya satu sprint aktif per project — pelanggaran → P2002).
  const nextStatus = body.status
  const statusChanged = nextStatus !== undefined && nextStatus !== before.status

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name
  if (body.goal !== undefined) data.goal = body.goal || null
  if (body.startDate !== undefined) data.startDate = nextStart
  if (body.endDate !== undefined) data.endDate = nextEnd
  if (nextStatus !== undefined) data.status = nextStatus

  if (statusChanged && nextStatus === 'completed') {
    const result = await closeSprint({ sprintId: params.id, actorId: admin.id })
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status })
    await logActivity({
      userId: admin.id,
      action: 'sprint_completed',
      entityType: 'sprint',
      entityId: params.id,
      oldValue: { status: before.status },
      newValue: { status: 'completed', movedToBacklog: result.movedToBacklog, movedToSprint: result.movedToSprint, stayedInSprint: result.stayedInSprint },
      description: `${admin.name} menutup sprint "${before.name}"`,
    })
    const after = await db.sprint.findUniqueOrThrow({ where: { id: params.id }, include: SPRINT_INCLUDE })
    return NextResponse.json({ sprint: mapSprint(after) })
  }

  try {
    const updated = await db.$transaction(async (tx) => {
      await tx.sprint.update({ where: { id: params.id }, data })
      return tx.sprint.findUniqueOrThrow({ where: { id: params.id }, include: SPRINT_INCLUDE })
    }, TX_OPTIONS)

    if (statusChanged) {
      const action = nextStatus === 'active' ? 'sprint_started' : 'sprint_reopened'
      await logActivity({
        userId: admin.id,
        action,
        entityType: 'sprint',
        entityId: updated.id,
        oldValue: { status: before.status },
        newValue: { status: nextStatus },
        description: `${admin.name} mengubah status sprint "${before.name}": ${before.status} → ${nextStatus}`,
      })
    } else {
      await logActivity({
        userId: admin.id,
        action: 'sprint_updated',
        entityType: 'sprint',
        entityId: updated.id,
        oldValue: { name: before.name, startDate: before.startDate, endDate: before.endDate },
        newValue: { name: updated.name, startDate: updated.startDate, endDate: updated.endDate },
        description: `${admin.name} mengubah sprint "${before.name}"`,
      })
    }

    return NextResponse.json({ sprint: mapSprint(updated) })
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'Sudah ada sprint aktif di project ini. Tutup dulu sprint yang berjalan.' },
        { status: 409 }
      )
    }
    throw e
  }
}

// POST /api/sprints/:id — tutup sprint (carry-over task belum selesai ke backlog/sprint lain)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(ADMIN_ROLES)
  if (error) return error

  const parsed = await parseJson(req, sprintCompleteSchema)
  if (parsed.error) return parsed.error

  const before = await findSprint(params.id)
  if (!before) return NextResponse.json({ error: 'Sprint tidak ditemukan.' }, { status: 404 })

  const result = await closeSprint({
    sprintId: params.id,
    moveToSprintId: parsed.data.moveToSprintId || null,
    taskIds: parsed.data.taskIds,
    actorId: admin.id,
  })
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status })

  await logActivity({
    userId: admin.id,
    action: 'sprint_completed',
    entityType: 'sprint',
    entityId: params.id,
    newValue: {
      movedToBacklog: result.movedToBacklog,
      movedToSprint: result.movedToSprint,
    },
    description: `${admin.name} menutup sprint "${before.name}" — ${result.movedToSprint} task dipindah, ${result.movedToBacklog} ke Backlog, ${result.stayedInSprint} task Review/Done tetap di sprint`,
  })

  const after = await db.sprint.findUniqueOrThrow({ where: { id: params.id }, include: SPRINT_INCLUDE })
  return NextResponse.json({
    sprint: mapSprint(after),
    movedToBacklog: result.movedToBacklog,
    movedToSprint: result.movedToSprint,
  })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(ADMIN_ROLES)
  if (error) return error

  const sprint = await findSprint(params.id)
  if (!sprint) return NextResponse.json({ error: 'Sprint tidak ditemukan.' }, { status: 404 })

  await db.$transaction(async (tx) => {
    // Task di sprint ini dilepas ke backlog; riwayat ditutup.
    await tx.taskSprintHistory.updateMany({
      where: { sprintId: params.id, leftAt: null },
      data: { leftAt: new Date(), leftReason: 'sprint_deleted' },
    })
    await tx.task.updateMany({ where: { sprintId: params.id }, data: { sprintId: null } })
    await tx.sprint.delete({ where: { id: params.id } })
  }, TX_OPTIONS)

  await logActivity({
    userId: admin.id,
    action: 'sprint_deleted',
    entityType: 'sprint',
    entityId: params.id,
    oldValue: { name: sprint.name, projectId: sprint.projectId },
    description: `${admin.name} menghapus sprint "${sprint.name}"`,
  })

  return NextResponse.json({ ok: true })
}
