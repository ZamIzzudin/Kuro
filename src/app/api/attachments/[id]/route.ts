// GET /api/attachments/:id — unduh/tampilkan lampiran (task atau clock out) dari MinIO.
// Akses: admin bebas; freelancer hanya untuk lampiran task yang terlihat olehnya
// atau lampiran time entry miliknya sendiri. Object key tetap privat.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireApiUser } from '@/lib/auth'
import { freelancerTaskScope } from '@/lib/tasks'
import { StorageNotConfiguredError, getObjectBuffer, isStorageConfigured } from '@/lib/storage'

function contentDispositionInline(contentType: string, fileName: string) {
  const kind = contentType.startsWith('image/') ? 'inline' : 'attachment'
  const safe = fileName.replace(/["\\\r\n]/g, '_')
  return `${kind}; filename="${safe}"`
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireApiUser()
  if (error) return error

  let objectKey: string | null = null
  let fileName = 'lampiran'
  let contentType = 'application/octet-stream'

  const taskAtt = await db.taskAttachment.findUnique({
    where: { id: params.id },
    include: { task: { select: { id: true } } },
  })

  if (taskAtt) {
    if (user.role === 'freelancer') {
      const allowed = await db.task.findFirst({
        where: { AND: [{ id: taskAtt.taskId }, freelancerTaskScope(user.id)] },
        select: { id: true },
      })
      if (!allowed) return NextResponse.json({ error: 'Lampiran tidak ditemukan.' }, { status: 404 })
    }
    objectKey = taskAtt.objectKey
    fileName = taskAtt.fileName
    contentType = taskAtt.contentType
  } else {
    const entryAtt = await db.timeEntryAttachment.findUnique({
      where: { id: params.id },
      include: { timeEntry: { select: { userId: true } } },
    })
    if (!entryAtt) return NextResponse.json({ error: 'Lampiran tidak ditemukan.' }, { status: 404 })
    if (user.role === 'freelancer' && entryAtt.timeEntry.userId !== user.id) {
      return NextResponse.json({ error: 'Lampiran tidak ditemukan.' }, { status: 404 })
    }
    objectKey = entryAtt.objectKey
    fileName = entryAtt.fileName
    contentType = entryAtt.contentType
  }

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: 'Storage belum dikonfigurasi.' }, { status: 503 })
  }

  try {
    const { body, contentType: storedType } = await getObjectBuffer(objectKey)
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': storedType || contentType,
        'Content-Length': String(body.length),
        'Content-Disposition': contentDispositionInline(contentType, fileName),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (e) {
    if (e instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 })
    }
    return NextResponse.json({ error: 'Lampiran tidak ditemukan.' }, { status: 404 })
  }
}
