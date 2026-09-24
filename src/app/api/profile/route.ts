// PATCH /api/profile — user mengubah profilnya sendiri (username, nama lengkap, foto).
// Email TIDAK bisa diubah di sini (identitas akun).
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { avatarUrlFor, requireApiUser } from '@/lib/auth'
import { removeObject } from '@/lib/storage'
import { profileUpdateSchema } from '@/lib/validators'

export async function PATCH(req: Request) {
  const { user, error } = await requireApiUser(['admin', 'freelancer'])
  if (error) return error

  const parsed = await parseJson(req, profileUpdateSchema)
  if (parsed.error) return parsed.error
  const { username, name, avatarKey } = parsed.data

  const current = await db.user.findUnique({ where: { id: user.id } })
  if (!current) {
    return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 })
  }

  // Username unik (case-insensitive karena disimpan lowercase)
  if (username !== undefined && username !== null) {
    const taken = await db.user.findFirst({
      where: { username, NOT: { id: user.id } },
      select: { id: true },
    })
    if (taken) {
      return NextResponse.json({ error: 'Username sudah dipakai.' }, { status: 409 })
    }
  }

  const data: Record<string, unknown> = {}
  if (username !== undefined) data.username = username || null
  if (name !== undefined) data.name = name
  if (avatarKey !== undefined) data.avatarKey = avatarKey || null

  const updated = await db.user.update({
    where: { id: user.id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      role: true,
      avatarKey: true,
    },
  })

  // Foto lama dihapus dari storage setelah update sukses (best-effort).
  if (
    avatarKey !== undefined &&
    current.avatarKey &&
    current.avatarKey !== avatarKey
  ) {
    await removeObject(current.avatarKey)
  }

  await logActivity({
    userId: user.id,
    action: 'profile_updated',
    entityType: 'user',
    entityId: user.id,
    oldValue: { name: current.name, username: current.username, hasAvatar: Boolean(current.avatarKey) },
    newValue: {
      name: updated.name,
      username: updated.username,
      hasAvatar: Boolean(updated.avatarKey),
    },
    description: `${updated.name} memperbarui profilnya`,
  })

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      username: updated.username,
      role: updated.role,
      avatarUrl: avatarUrlFor(updated),
    },
  })
}
