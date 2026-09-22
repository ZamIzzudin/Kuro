// POST /api/auth/logout — hapus session server-side + clear cookie
import { NextResponse } from 'next/server'
import { SESSION_COOKIE, destroySession, getSessionUser, sessionCookieOptions } from '@/lib/auth'
import { logActivity } from '@/lib/activity'

export async function POST() {
  const user = await getSessionUser()
  if (user) {
    await logActivity({
      userId: user.id,
      action: 'auth_logout',
      entityType: 'user',
      entityId: user.id,
      description: `${user.name} logout`,
    })
  }
  await destroySession()

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 })
  return res
}
