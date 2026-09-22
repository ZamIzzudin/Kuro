// POST /api/auth/reset-password — set password baru dari token email
// Token sekali pakai; semua session user lain di-revoke.
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashToken } from '@/lib/auth'
import { logActivity } from '@/lib/activity'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { resetPasswordSchema } from '@/lib/validators'

export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`reset:${ip}`, 10, 60 * 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Terlalu banyak permintaan.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const parsed = resetPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' },
      { status: 400 }
    )
  }

  const { token, password } = parsed.data
  const id = hashToken(token)
  const record = await db.passwordResetToken.findUnique({ where: { id } })

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: 'Token tidak valid atau sudah kedaluwarsa. Ajukan ulang reset password.' },
      { status: 400 }
    )
  }

  const passwordHash = await bcrypt.hash(password, 10)
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: record.userId } }),
  ])
  await logActivity({
    userId: record.userId,
    action: 'password_reset_done',
    entityType: 'user',
    entityId: record.userId,
    description: 'Password direset via email',
  })

  return NextResponse.json({ ok: true, message: 'Password berhasil diubah. Silakan login.' })
}
