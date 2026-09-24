// POST /api/uploads/avatar — unggah foto profil sendiri ke MinIO.
// Multipart: field "file". Mengembalikan { key } untuk disimpan di user.avatarKey.
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import {
  ALLOWED_AVATAR_TYPES,
  MAX_AVATAR_BYTES,
  StorageNotConfiguredError,
  avatarObjectKey,
  isStorageConfigured,
  putObject,
} from '@/lib/storage'

export async function POST(req: Request) {
  const { error } = await requireApiUser(['admin', 'freelancer'])
  if (error) return error

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: 'Penyimpanan gambar (MinIO) belum dikonfigurasi di server.' },
      { status: 503 }
    )
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Berkas gambar tidak ditemukan.' }, { status: 400 })
  }

  const ext = ALLOWED_AVATAR_TYPES[file.type]
  if (!ext) {
    return NextResponse.json({ error: 'Format gambar harus PNG, JPEG, atau WebP.' }, { status: 400 })
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: 'Ukuran gambar maksimal 2 MB.' }, { status: 400 })
  }

  const key = avatarObjectKey(ext)
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
