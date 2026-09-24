// POST /api/uploads/attachment — unggah satu berkas lampiran ke MinIO (task / clock out).
// Multipart: field "file". Mengembalikan metadata untuk disimpan bersama task/time entry.
// Jumlah lampiran tidak dibatasi; batas ukuran per berkas 25 MB.
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import {
  MAX_ATTACHMENT_BYTES,
  StorageNotConfiguredError,
  attachmentObjectKey,
  isStorageConfigured,
  putObject,
} from '@/lib/storage'

export async function POST(req: Request) {
  const { error } = await requireApiUser(['admin', 'freelancer'])
  if (error) return error

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: 'Penyimpanan lampiran (MinIO) belum dikonfigurasi di server.' },
      { status: 503 }
    )
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Berkas tidak ditemukan.' }, { status: 400 })
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: 'Ukuran berkas maksimal 25 MB.' }, { status: 400 })
  }

  const contentType = file.type || 'application/octet-stream'
  const fileName = (file.name || 'lampiran').slice(0, 200)
  const key = attachmentObjectKey(fileName)

  try {
    await putObject(key, Buffer.from(await file.arrayBuffer()), contentType)
  } catch (e) {
    if (e instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 })
    }
    return NextResponse.json({ error: 'Gagal mengunggah berkas ke storage.' }, { status: 502 })
  }

  return NextResponse.json(
    { objectKey: key, fileName, contentType, size: file.size },
    { status: 201 }
  )
}
