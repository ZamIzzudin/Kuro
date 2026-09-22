// Handler generik untuk master data (Project / Jenis Pekerjaan / Requester) — admin only.
// Dipakai oleh /api/projects, /api/work-types, /api/requesters.
import { NextResponse } from 'next/server'
import { db } from './db'
import { logActivity } from './activity'
import { parseJson, prismaError } from './api-helpers'
import { requireApiUser } from './auth'
import { masterCreateSchema, masterUpdateSchema } from './validators'

type MasterKey = 'project' | 'workType' | 'requester'

const LABEL: Record<MasterKey, string> = {
  project: 'Project',
  workType: 'Jenis Pekerjaan',
  requester: 'Requester',
}

type MasterItemRow = {
  id: string
  name: string
  isActive: boolean
  createdAt: Date
}

// Interface minimal (cast) supaya 3 delegate Prisma bisa dipakai lewat satu tipe
interface MasterDelegate {
  findMany(args: { orderBy: { name: 'asc' } }): Promise<MasterItemRow[]>
  create(args: { data: { name: string; creatorId?: string } }): Promise<MasterItemRow>
  findUnique(args: { where: { id: string } }): Promise<MasterItemRow | null>
  update(args: { where: { id: string }; data: { name?: string; isActive?: boolean } }): Promise<MasterItemRow>
}

function table(key: MasterKey): MasterDelegate {
  // Prisma delegate sesuai model
  return {
    project: db.project,
    workType: db.workType,
    requester: db.requester,
  }[key] as unknown as MasterDelegate
}

export function masterHandlers(key: MasterKey) {
  const label = LABEL[key]
  const model = table(key)

  return {
    /** GET — daftar semua (termasuk nonaktif), urut nama */
    async GET() {
      const { error } = await requireApiUser(['admin'])
      if (error) return error
      const items = await model.findMany({ orderBy: { name: 'asc' } })
      return NextResponse.json({ items })
    },

    /** POST — tambah item baru (admin; requester hanya admin — Q6) */
    async POST(req: Request) {
      const { user: admin, error } = await requireApiUser(['admin'])
      if (error) return error

      const parsed = await parseJson(req, masterCreateSchema)
      if (parsed.error) return parsed.error

      try {
        const data: { name: string; creatorId?: string } = { name: parsed.data.name }
        if (key === 'requester') data.creatorId = admin.id
        const created = await model.create({ data })
        await logActivity({
          userId: admin.id,
          action: 'master_created',
          entityType: key,
          entityId: created.id,
          newValue: { name: created.name },
          description: `${admin.name} menambah ${label} "${created.name}"`,
        })
        return NextResponse.json({ item: created }, { status: 201 })
      } catch (e) {
        const res = prismaError(e)
        if (res) return res
        throw e
      }
    },

    /** PATCH — rename / aktif-nonaktifkan */
    async PATCH(req: Request, { params }: { params: { id: string } }) {
      const { user: admin, error } = await requireApiUser(['admin'])
      if (error) return error

      const parsed = await parseJson(req, masterUpdateSchema)
      if (parsed.error) return parsed.error

      try {
        const before = await model.findUnique({ where: { id: params.id } })
        if (!before) {
          return NextResponse.json({ error: `${label} tidak ditemukan.` }, { status: 404 })
        }
        const updated = await model.update({
          where: { id: params.id },
          data: parsed.data,
        })
        await logActivity({
          userId: admin.id,
          action: 'master_updated',
          entityType: key,
          entityId: updated.id,
          oldValue: { name: before.name, isActive: before.isActive },
          newValue: { name: updated.name, isActive: updated.isActive },
          description: `${admin.name} mengubah ${label} "${before.name}"`,
        })
        return NextResponse.json({ item: updated })
      } catch (e) {
        const res = prismaError(e)
        if (res) return res
        throw e
      }
    },
  }
}

export type MasterHandlers = ReturnType<typeof masterHandlers>
