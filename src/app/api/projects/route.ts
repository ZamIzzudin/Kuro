// /api/projects — daftar & buat project (enhancement: banner, requester, member)
// GET  : admin → semua project; freelancer → project aktif yang di-assign ke dia
//        (dipakai juga untuk dropdown project di sidebar freelancer)
// POST : admin only — buat project lengkap
import { NextResponse } from 'next/server'
import { db, TX_OPTIONS } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson, prismaError } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { listProjects, mapProject, validateProjectRelations } from '@/lib/projects'
import { freelancerProjectScope } from '@/lib/tasks'
import { projectCreateSchema } from '@/lib/validators'

export async function GET() {
  const { user, error } = await requireApiUser()
  if (error) return error

  const where =
    user.role === 'admin'
      ? undefined
      : { isActive: true, ...freelancerProjectScope(user.id) }

  const projects = await listProjects(where)
  return NextResponse.json({ projects: projects.map(mapProject) })
}

export async function POST(req: Request) {
  const { user: admin, error } = await requireApiUser(['admin'])
  if (error) return error

  const parsed = await parseJson(req, projectCreateSchema)
  if (parsed.error) return parsed.error
  const { name, description, bannerColor, bannerKey, requesterIds, memberIds } = parsed.data

  const invalid = await validateProjectRelations({ requesterIds, memberIds })
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  try {
    const created = await db.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name,
          description: description || null,
          bannerColor: bannerColor || null,
          bannerKey: bannerKey || null,
        },
      })
      if (requesterIds?.length) {
        await tx.projectRequester.createMany({
          data: requesterIds.map((requesterId) => ({ projectId: project.id, requesterId })),
          skipDuplicates: true,
        })
      }
      if (memberIds?.length) {
        await tx.projectMember.createMany({
          data: memberIds.map((userId) => ({ projectId: project.id, userId })),
          skipDuplicates: true,
        })
      }
      return tx.project.findUniqueOrThrow({
        where: { id: project.id },
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true, isActive: true } } } },
          requesters: { include: { requester: { select: { id: true, name: true, isActive: true } } } },
          _count: { select: { tasks: true } },
        },
      })
    }, TX_OPTIONS)

    await logActivity({
      userId: admin.id,
      action: 'project_created',
      entityType: 'project',
      entityId: created.id,
      newValue: { name, description: description ?? null, bannerColor: bannerColor ?? null, bannerKey: bannerKey ?? null, requesterIds, memberIds },
      description: `${admin.name} menambah project "${name}"`,
    })

    return NextResponse.json({ project: mapProject(created) }, { status: 201 })
  } catch (e) {
    const res = prismaError(e)
    if (res) return res
    throw e
  }
}
