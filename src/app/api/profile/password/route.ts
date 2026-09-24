// POST /api/profile/password — ganti password sendiri (wajib password lama).
// Sesi lain di-revoke; sesi saat ini dipertahankan agar user tidak ter-logout.
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { SESSION_COOKIE, hashToken, requireApiUser } from '@/lib/auth'
import { changePasswordSchema } from '@/lib/validators'

export async function POST(req: Request) {
  const { user, error } = await requireApiUser(['admin', 'freelancer'])
  if (error) return error

  const parsed = await parseJson(req, changePasswordSchema)
  if (parsed.error) return parsed.error
  const { currentPassword, newPassword } = parsed.data

  const me = await db.user.findUnique({ where: { id: user.id } })
  if (!me) {
    return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 })
  }

  const ok = await bcrypt.compare(currentPassword, me.passwordHash)
  if (!ok) {
    return NextResponse.json({ error: 'Password lama salah.' }, { status: 400 })
  }
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: 'Password baru harus berbeda dari password lama.' },
      { status: 400 }
    )
  }

  const raw = cookies().get(SESSION_COOKIE)?.value
  const currentSessionId = raw ? hashToken(raw) : null

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    })
    // Revoke semua sesi lain (sesi saat ini dipertahankan)
    await tx.session.deleteMany({
      where: { userId: user.id, ...(currentSessionId ? { NOT: { id: currentSessionId } } : {}) },
    })
  })

  await logActivity({
    userId: user.id,
    action: 'password_changed',
    entityType: 'user',
    entityId: user.id,
    description: `${me.name} mengganti password sendiri`,
  })

  return NextResponse.json({ ok: true, message: 'Password berhasil diperbarui.' })
}
