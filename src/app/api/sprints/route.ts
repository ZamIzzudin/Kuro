// /api/sprints — GET (daftar sprint; freelancer scoped ke project-nya) & POST (admin & project manager)
import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { ADMIN_ROLES } from '@/lib/roles'
import { mapSprint, SPRINT_INCLUDE, sprintCounts } from '@/lib/sprints'
import { freelancerProjectScope } from '@/lib/tasks'
import { dateOnlyUTC } from '@/lib/time'
import { sprintCreateSchema } from '@/lib/validators'

export async function GET(req: Request) {
  const { user, error } = await requireApiUser()
  if (error) return error

  const sp = new URL(req.url).searchParams
  const projectId = sp.get('projectId')
  const status = sp.get('status')

  const where: Prisma.SprintWhereInput = {}
  if (projectId && projectId !== 'all') where.projectId = projectId
  if (status && status !== 'all') {
    where.status = status as Prisma.EnumSprintStatusFilter['equals']
  }
  // Rule #12: freelancer hanya melihat sprint pada project yang relevan baginya.
  if (user.role === 'freelancer') {
    where.project = freelancerProjectScope(user.id)
  }

  const rows = await db.sprint.findMany({
    where,
    include: SPRINT_INCLUDE,
    orderBy: [{ startDate: 'desc' }],
    take: 200,
  })
  const counts = await sprintCounts(rows.map((r) => r.id))
  return NextResponse.json({
    sprints: rows.map((s) => mapSprint(s, counts.get(s.id))),
  })
}

export async function POST(req: Request) {
  const { user: admin, error } = await requireApiUser(ADMIN_ROLES)
  if (error) return error

  const parsed = await parseJson(req, sprintCreateSchema)
  if (parsed.error) return parsed.error
  const { projectId, name, goal, startDate, endDate } = parsed.data

  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project?.isActive) {
    return NextResponse.json({ error: 'Project tidak ditemukan/nonaktif.' }, { status: 400 })
  }

  const created = await db.sprint.create({
    data: {
      projectId,
      name,
      goal: goal || null,
      startDate: dateOnlyUTC(startDate),
      endDate: dateOnlyUTC(endDate),
      createdById: admin.id,
    },
    include: SPRINT_INCLUDE,
  })

  await logActivity({
    userId: admin.id,
    action: 'sprint_created',
    entityType: 'sprint',
    entityId: created.id,
    newValue: { name, projectId, startDate, endDate },
    description: `${admin.name} membuat sprint "${name}" pada project "${project.name}"`,
  })

  return NextResponse.json({ sprint: mapSprint(created) }, { status: 201 })
}
