// /api/projects/:id — detail & ubah project (enhancement)
// GET   : semua login (freelancer hanya bila project aktif & dia member)
// PATCH : admin only
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson, prismaError } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { findProject, mapProject, setProjectRelations, validateProjectRelations } from '@/lib/projects'
import { StorageNotConfiguredError, isStorageConfigured, removeObject } from '@/lib/storage'
import { projectUpdateSchema } from '@/lib/validators'

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
    const hasTask = await db.task.count({ where: { projectId: params.id, assigneeId: user.id } })
    if (!hasTask) return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
  }

  return NextResponse.json({ project: mapProject(project) })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(['admin'])
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
          _count: { select: { tasks: true } },
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
