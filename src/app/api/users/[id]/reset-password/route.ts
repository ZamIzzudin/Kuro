// /api/users/:id/reset-password — admin set password baru (tanpa email), revoke sesi
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { adminResetPasswordSchema } from '@/lib/validators'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(['admin'])
  if (error) return error

  const parsed = await parseJson(req, adminResetPasswordSchema)
  if (parsed.error) return parsed.error

  const target = await db.user.findUnique({ where: { id: params.id } })
  if (!target) {
    return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 })
  }

  await db.$transaction([
    db.user.update({
      where: { id: target.id },
      data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) },
    }),
    db.session.deleteMany({ where: { userId: target.id } }),
  ])
  await logActivity({
    userId: admin.id,
    action: 'user_password_reset_by_admin',
    entityType: 'user',
    entityId: target.id,
    description: `${admin.name} mereset password user "${target.name}"`,
  })
  return NextResponse.json({ ok: true, message: `Password ${target.name} berhasil direset.` })
}
