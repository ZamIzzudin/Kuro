// GET /api/dashboard/live — sesi berjalan (admin): siapa clock in, task apa, durasi berjalan
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { getLiveSessions } from '@/lib/dashboard'

export async function GET() {
  const { error } = await requireApiUser(['admin'])
  if (error) return error

  const sessions = await getLiveSessions()
  return NextResponse.json({ sessions })
}
