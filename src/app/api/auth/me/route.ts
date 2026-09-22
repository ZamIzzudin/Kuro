// GET /api/auth/me — profil user dari session aktif
import { NextResponse } from 'next/server'
import { getSessionUser, publicUser } from '@/lib/auth'

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 })
  }
  return NextResponse.json({ user: publicUser(user) })
}
