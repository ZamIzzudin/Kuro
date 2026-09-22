// POST /api/auth/login — email + password → session cookie (8 jam)
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SESSION_COOKIE, createSession, publicUser, sessionCookieOptions } from '@/lib/auth'
import { logActivity } from '@/lib/activity'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { loginSchema } from '@/lib/validators'

export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`login:${ip}`, 10, 10 * 60_000) // 10 percobaan / 10 menit
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Terlalu banyak percobaan login. Coba lagi dalam ${rl.retryAfter} detik.` },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' },
      { status: 400 }
    )
  }

  const { email, password } = parsed.data
  const user = await db.user.findUnique({ where: { email } })
  const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false

  // Pesan generik — anti user enumeration
  if (!user || !passwordOk) {
    return NextResponse.json({ error: 'Email atau password salah' }, { status: 400 })
  }
  if (!user.isActive) {
    return NextResponse.json(
      { error: 'Akun dinonaktifkan. Hubungi admin.' },
      { status: 403 }
    )
  }

  const { token } = await createSession(user.id, {
    ip,
    userAgent: req.headers.get('user-agent') ?? undefined,
  })
  await logActivity({
    userId: user.id,
    action: 'auth_login',
    entityType: 'user',
    entityId: user.id,
    description: `${user.name} login`,
  })

  const res = NextResponse.json({ user: publicUser(user) })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
  return res
}
