// /api/projects/:id — detail & ubah project (enhancement)
// GET   : semua login (freelancer hanya bila project aktif & dia member)
// PATCH : admin & project manager
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson, prismaError } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { ADMIN_ROLES } from '@/lib/roles'
import { findProject, mapProject, setProjectRelations, validateProjectRelations } from '@/lib/projects'
import { StorageNotConfiguredError, isStorageConfigured, removeObject } from '@/lib/storage'
import { projectDeleteSchema, projectUpdateSchema } from '@/lib/validators'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireApiUser()
  if (error) return error

  const project = await findProject(params.id)
  if (!project) return NextResponse.json({ error: 'Project tidak ditemukan.' }, { status: 404 })

  if (user.role === 'freelancer' && !project.isActive) {
    return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
  }
  if (user.role === 'freelancer' && !project.members.some((m) => m.user.id === user.id)) {
    // Izinkan bila freelancer punya task di project ini (konsisten dgn dropdown)
    const hasTask = await db.task.count({ where: { projectId: params.id, assignees: { some: { userId: user.id } } } })
    if (!hasTask) return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
  }

  return NextResponse.json({ project: mapProject(project) })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(ADMIN_ROLES)
  if (error) return error

  const parsed = await parseJson(req, projectUpdateSchema)
  if (parsed.error) return parsed.error
  const { name, description, bannerColor, bannerKey, isActive, requesterIds, memberIds } = parsed.data

  const before = await findProject(params.id)
  if (!before) return NextResponse.json({ error: 'Project tidak ditemukan.' }, { status: 404 })

  const invalid = await validateProjectRelations({ requesterIds, memberIds })
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  // Isi data skalar yang benar-benar dikirim (prisma butuh undefined agar tidak diubah)
  const data: {
    name?: string
    description?: string | null
    bannerColor?: string | null
    bannerKey?: string | null
    isActive?: boolean
  } = {}
  if (name !== undefined) data.name = name
  if (description !== undefined) data.description = description || null
  if (bannerColor !== undefined) data.bannerColor = bannerColor || null
  if (bannerKey !== undefined) data.bannerKey = bannerKey
  if (isActive !== undefined) data.isActive = isActive

  try {
    const updated = await db.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.project.update({ where: { id: params.id }, data })
      }
      await setProjectRelations(tx, params.id, { requesterIds, memberIds })
      return tx.project.findUniqueOrThrow({
        where: { id: params.id },
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true, isActive: true } } } },
          requesters: { include: { requester: { select: { id: true, name: true, isActive: true } } } },
          tasks: { select: { status: true, deadlineAt: true, sprintId: true } },
        },
      })
    }, TX_OPTIONS)

    // Bersihkan objek banner lama bila diganti/dihapus (cegah file orphan di MinIO)
    if (bannerKey !== undefined && before.bannerKey && before.bannerKey !== updated.bannerKey) {
      if (isStorageConfigured()) {
        await removeObject(before.bannerKey).catch((e) => {
          if (!(e instanceof StorageNotConfiguredError))
            console.error('Gagal menghapus banner lama:', e)
        })
      }
    }

    await logActivity({
      userId: admin.id,
      action: 'project_updated',
      entityType: 'project',
      entityId: updated.id,
      oldValue: {
        name: before.name,
        description: before.description,
        bannerColor: before.bannerColor,
        bannerKey: before.bannerKey,
        isActive: before.isActive,
      },
      newValue: { name, description, bannerColor, bannerKey, isActive, requesterIds, memberIds },
      description: `${admin.name} mengubah project "${before.name}"`,
    })

    return NextResponse.json({ project: mapProject(updated) })
  } catch (e) {
    const res = prismaError(e)
    if (res) return res
    throw e
  }
}

// DELETE /api/projects/:id — hapus project BESERTA seluruh datanya (admin & project manager).
// Wajib mengetikkan nama project persis sebagai konfirmasi. Skema tidak memakai
// onDelete cascade pada relasi Task/TimeEntry/Correction, jadi pembersihan
// dilakukan berurutan di dalam transaksi, lalu objek MinIO (banner + lampiran)
// dihapus best-effort setelah transaksi sukses.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(ADMIN_ROLES)
  if (error) return error

  const parsed = await parseJson(req, projectDeleteSchema)
  if (parsed.error) return parsed.error

  const project = await findProject(params.id)
  if (!project) return NextResponse.json({ error: 'Project tidak ditemukan.' }, { status: 404 })

  if (parsed.data.confirmName !== project.name) {
    return NextResponse.json(
      { error: 'Nama project tidak cocok. Ketik persis sama untuk menghapus.' },
      { status: 400 }
    )
  }

  // Kumpulkan objek MinIO yang harus dibersihkan (banner + semua lampiran task/subtask/entry).
  const [taskAttachments, subtaskAttachments, entryAttachments] = await Promise.all([
    db.taskAttachment.findMany({
      where: { task: { projectId: params.id } },
      select: { objectKey: true },
    }),
    db.subtaskAttachment.findMany({
      where: { subtask: { task: { projectId: params.id } } },
      select: { objectKey: true },
    }),
    db.timeEntryAttachment.findMany({
      where: { timeEntry: { subtask: { task: { projectId: params.id } } } },
      select: { objectKey: true },
    }),
  ])
  const objectKeys = [
    ...(project.bannerKey ? [project.bannerKey] : []),
    ...taskAttachments.map((a) => a.objectKey),
    ...subtaskAttachments.map((a) => a.objectKey),
    ...entryAttachments.map((a) => a.objectKey),
  ]

  const taskIds = await db.task.findMany({
    where: { projectId: params.id },
    select: { id: true },
  })
  const taskIdList = taskIds.map((t) => t.id)

  await db.$transaction(async (tx) => {
    // Koreksi → TimeEntry → Subtask → Task → Sprint → Project
    // (TaskAssignee/TaskAttachment/TaskSprintHistory ikut cascade saat Task dihapus,
    //  SubtaskAttachment ikut cascade saat Subtask dihapus.)
    await tx.correctionRequest.deleteMany({
      where: { timeEntry: { subtask: { task: { projectId: params.id } } } },
    })
    await tx.timeEntry.deleteMany({ where: { subtask: { task: { projectId: params.id } } } })
    if (taskIdList.length) {
      await tx.subtask.deleteMany({ where: { taskId: { in: taskIdList } } })
      await tx.task.deleteMany({ where: { projectId: params.id } })
    }
    await tx.sprint.deleteMany({ where: { projectId: params.id } })
    await tx.project.delete({ where: { id: params.id } })
  }, TX_OPTIONS)

  // Bersihkan objek MinIO setelah DB (best-effort, jangan gagalkan request).
  if (isStorageConfigured() && objectKeys.length) {
    await Promise.all(
      objectKeys.map((key) =>
        removeObject(key).catch((e) => {
          if (!(e instanceof StorageNotConfiguredError))
            console.error('Gagal menghapus objek project:', key, e)
        })
      )
    )
  }

  await logActivity({
    userId: admin.id,
    action: 'project_deleted',
    entityType: 'project',
    entityId: params.id,
    oldValue: {
      name: project.name,
      description: project.description,
      bannerColor: project.bannerColor,
      bannerKey: project.bannerKey,
      taskCount: project.tasks.length,
    },
    description: `${admin.name} menghapus project "${project.name}" beserta ${project.tasks.length} task dan seluruh datanya`,
  })

  return NextResponse.json({ ok: true })
}
