// GET /api/dashboard/feed?cursor=&take= — activity feed terpaginasi (admin)
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { getActivityFeed } from '@/lib/dashboard'

export async function GET(req: Request) {
  const { error } = await requireApiUser(['admin'])
  if (error) return error

  const sp = new URL(req.url).searchParams
  const cursor = sp.get('cursor')
  const takeRaw = Number(sp.get('take'))
  const take = Number.isFinite(takeRaw) && takeRaw > 0 ? Math.min(50, takeRaw) : 20

  const feed = await getActivityFeed(cursor, take)
  return NextResponse.json(feed)
}
