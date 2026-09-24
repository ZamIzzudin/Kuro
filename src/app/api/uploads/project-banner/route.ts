// POST /api/uploads/project-banner — unggah gambar banner ke MinIO (admin only)
// Multipart: field "file". Mengembalikan { key } untuk disimpan di project.bannerKey.
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import {
  ALLOWED_BANNER_TYPES,
  MAX_BANNER_BYTES,
  StorageNotConfiguredError,
  bannerObjectKey,
  isStorageConfigured,
  putObject,
} from '@/lib/storage'

export async function POST(req: Request) {
  const { error } = await requireApiUser(['admin'])
  if (error) return error

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: 'Penyimpanan gambar (MinIO) belum dikonfigurasi di server.' },
      { status: 503 }
    )
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Berkas gambar tidak ditemukan.' }, { status: 400 })
  }

  const ext = ALLOWED_BANNER_TYPES[file.type]
  if (!ext) {
    return NextResponse.json(
      { error: 'Format gambar harus PNG, JPEG, atau WebP.' },
      { status: 400 }
    )
  }
  if (file.size > MAX_BANNER_BYTES) {
    return NextResponse.json({ error: 'Ukuran gambar maksimal 2 MB.' }, { status: 400 })
  }

  const key = bannerObjectKey(ext)
  try {
    await putObject(key, Buffer.from(await file.arrayBuffer()), file.type)
  } catch (e) {
    if (e instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 })
    }
    return NextResponse.json({ error: 'Gagal mengunggah gambar ke storage.' }, { status: 502 })
  }

  return NextResponse.json({ key }, { status: 201 })
}
