// GET /api/time-entries/active — sesi aktif milik user (untuk timer di /home)
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { findActiveEntry, mapTimeEntry } from '@/lib/time-entries'

export async function GET() {
  const { user, error } = await requireApiUser()
  if (error) return error

  const active = await findActiveEntry(user.id)
  return NextResponse.json({ entry: active ? mapTimeEntry(active) : null })
}
