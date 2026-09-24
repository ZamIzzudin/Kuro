// GET /api/projects/:id/banner — proxy gambar banner dari MinIO (semua login).
// Dipakai <img src> sehingga cookie sesi otomatis ikut; object key tetap privat.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { StorageNotConfiguredError, getObjectBuffer, isStorageConfigured } from '@/lib/storage'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireApiUser()
  if (error) return error

  const project = await db.project.findUnique({
    where: { id: params.id },
    select: { bannerKey: true },
  })
  if (!project?.bannerKey) {
    return NextResponse.json({ error: 'Banner tidak ditemukan.' }, { status: 404 })
  }
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: 'Storage belum dikonfigurasi.' }, { status: 503 })
  }

  try {
    const { body, contentType } = await getObjectBuffer(project.bannerKey)
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': contentType,
        // Object key unik per unggahan → aman di-cache lama
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    })
  } catch (e) {
    if (e instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 })
    }
    return NextResponse.json({ error: 'Banner tidak ditemukan.' }, { status: 404 })
  }
}
