// POST /api/auth/forgot-password — kirim link reset via email (token 1 jam, sekali pakai)
// Selalu balas sukses — anti user enumeration (RANCANGAN §8)
import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashToken } from '@/lib/auth'
import { logActivity } from '@/lib/activity'
import { resetPasswordEmail, sendMail } from '@/lib/mail'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { forgotPasswordSchema } from '@/lib/validators'

export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`forgot:${ip}`, 5, 60 * 60_000) // 5x / jam
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Terlalu banyak permintaan. Coba lagi dalam ${rl.retryAfter} detik.` },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = forgotPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' },
      { status: 400 }
    )
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } })
  if (user && user.isActive) {
    // Satu token aktif per user: hapus token lama yang belum dipakai
    await db.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    })

    const token = crypto.randomBytes(32).toString('hex')
    await db.passwordResetToken.create({
      data: {
        id: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60_000), // 1 jam
      },
    })

    const appUrl = process.env.APP_URL || 'http://localhost:3000'
    const link = `${appUrl}/reset-password?token=${token}`
    await sendMail({
      to: user.email,
      subject: 'Reset password — Kuro',
      html: resetPasswordEmail(user.name, link),
    })
    await logActivity({
      userId: user.id,
      action: 'password_reset_requested',
      entityType: 'user',
      entityId: user.id,
      description: `${user.name} meminta reset password`,
    })
  }

  return NextResponse.json({
    ok: true,
    message: 'Jika email terdaftar, link reset sudah dikirim. Periksa inbox Anda.',
  })
}
