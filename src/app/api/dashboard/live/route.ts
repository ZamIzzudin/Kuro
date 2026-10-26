// GET /api/dashboard/live — sesi berjalan (admin & project manager): siapa clock in, task apa, durasi berjalan
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { ADMIN_ROLES } from '@/lib/roles'
import { getLiveSessions } from '@/lib/dashboard'

export async function GET() {
  const { error } = await requireApiUser(ADMIN_ROLES)
  if (error) return error

  const sessions = await getLiveSessions()
  return NextResponse.json({ sessions })
}
