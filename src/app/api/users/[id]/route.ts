// /api/users/:id — PATCH (edit nama/role/aktif) — admin only
// Safety: admin tidak boleh mengubah role / menonaktifkan akun sendiri.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { userUpdateSchema } from '@/lib/validators'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(['admin'])
  if (error) return error

  const parsed = await parseJson(req, userUpdateSchema)
  if (parsed.error) return parsed.error
  const { name, role, isActive } = parsed.data

  const target = await db.user.findUnique({ where: { id: params.id } })
  if (!target) {
    return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 })
  }

  // Proteksi akun sendiri
  if (target.id === admin.id) {
    if ((role !== undefined && role !== target.role) || isActive === false) {
      return NextResponse.json(
        { error: 'Tidak boleh mengubah role atau menonaktifkan akun sendiri.' },
        { status: 400 }
      )
    }
  }

  // Tidak boleh menghilangkan admin aktif terakhir (nonaktifkan ATAU turunkan role)
  const losingAdmin =
    target.role === 'admin' &&
    target.isActive &&
    (isActive === false || (role !== undefined && role !== 'admin'))
  if (losingAdmin) {
    const activeAdmins = await db.user.count({
      where: { role: 'admin', isActive: true },
    })
    if (activeAdmins <= 1) {
      return NextResponse.json(
        { error: 'Minimal harus ada satu admin aktif.' },
        { status: 400 }
      )
    }
  }

  const updated = await db.user.update({
    where: { id: params.id },
    data: { name, role, isActive },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  })

  // Nonaktifkan user → revoke semua sesinya
  if (isActive === false) {
    await db.session.deleteMany({ where: { userId: params.id } })
  }

  await logActivity({
    userId: admin.id,
    action: 'user_updated',
    entityType: 'user',
    entityId: updated.id,
    oldValue: { name: target.name, role: target.role, isActive: target.isActive },
    newValue: { name: updated.name, role: updated.role, isActive: updated.isActive },
    description: `${admin.name} mengubah user "${target.name}"`,
  })
  return NextResponse.json({ user: updated })
}
