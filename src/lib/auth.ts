// Notu — session management (Fase 0)
// Session cookie httpOnly + tabel Session, sliding expiry 8 jam (RANCANGAN §8)
import crypto from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from './db'

export const SESSION_COOKIE = 'notu_session'
export const SESSION_HOURS = 8

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export type SessionUser = {
  id: string
  email: string
  name: string
  role: 'admin' | 'freelancer'
}

export function publicUser(u: {
  id: string
  email: string
  name: string
  role: 'admin' | 'freelancer'
}): SessionUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role }
}

/** Buat sesi baru; kembalikan token mentah (disimpan di cookie) */
export async function createSession(
  userId: string,
  meta: { ip?: string; userAgent?: string } = {}
) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000)
  await db.session.create({
    data: { id: hashToken(token), userId, expiresAt, ip: meta.ip, userAgent: meta.userAgent },
  })
  return { token, expiresAt }
}

/** Ambil user dari sesi (server components & API). NULL jika invalid/kedaluwarsa. */
export async function getSessionUser() {
  const raw = cookies().get(SESSION_COOKIE)?.value
  if (!raw) return null

  const id = hashToken(raw)
  const session = await db.session.findUnique({ where: { id }, include: { user: true } })
  if (!session) return null

  const now = new Date()
  if (session.expiresAt < now || !session.user.isActive) {
    await db.session.delete({ where: { id } }).catch(() => {})
    return null
  }

  // Sliding expiry: perpanjang jika aktivitas terakhir > 30 menit lalu
  if (now.getTime() - session.lastSeenAt.getTime() > 30 * 60_000) {
    await db.session
      .update({
        where: { id },
        data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_HOURS * 3600_000) },
      })
      .catch(() => {})
  }

  return session.user
}

export async function destroySession() {
  const raw = cookies().get(SESSION_COOKIE)?.value
  if (raw) {
    await db.session.delete({ where: { id: hashToken(raw) } }).catch(() => {})
  }
}

/** Guard RBAC untuk API routes — role dicek di API, bukan hanya UI (RANCANGAN §8) */
export async function requireApiUser(roles?: Array<'admin' | 'freelancer'>) {
  const user = await getSessionUser()
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 }),
    }
  }
  if (roles && !roles.includes(user.role)) {
    return { user: null, error: NextResponse.json({ error: 'Akses ditolak' }, { status: 403 }) }
  }
  return { user, error: null }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_HOURS * 3600,
    path: '/',
  }
}
