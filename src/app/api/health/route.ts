// GET /api/health — cek kesehatan aplikasi & koneksi database (untuk healthcheck Dokploy).
// Tidak memerlukan autentikasi. Mengembalikan 200 bila DB terjangkau, 503 bila tidak.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({
      status: 'ok',
      db: 'up',
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json(
      {
        status: 'error',
        db: 'down',
        message: e instanceof Error ? e.message : 'Database tidak terjangkau',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
