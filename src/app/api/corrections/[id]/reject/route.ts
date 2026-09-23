// POST /api/corrections/:id/reject — tolak koreksi dengan catatan review (admin)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { correctionRejectSchema } from '@/lib/validators'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(['admin'])
  if (error) return error

  const parsed = await parseJson(req, correctionRejectSchema)
  if (parsed.error) return parsed.error
  const { reviewNote } = parsed.data

  const correction = await db.correctionRequest.findUnique({
    where: { id: params.id },
    include: {
      timeEntry: { include: { task: { select: { title: true } } } },
      requestedBy: { select: { name: true } },
    },
  })
  if (!correction) return NextResponse.json({ error: 'Koreksi tidak ditemukan.' }, { status: 404 })
  if (correction.status !== 'pending') {
    return NextResponse.json({ error: 'Koreksi ini sudah direview.' }, { status: 409 })
  }

  const now = new Date()
  await db.correctionRequest.update({
    where: { id: correction.id },
    data: { status: 'rejected', reviewedById: admin.id, reviewedAt: now, reviewNote },
  })

  await logActivity({
    userId: admin.id,
    action: 'correction_rejected',
    entityType: 'correction',
    entityId: correction.id,
    oldValue: { status: 'pending' },
    newValue: { status: 'rejected', reviewNote },
    description: `${admin.name} menolak koreksi ${correction.requestedBy.name} pada task "${correction.timeEntry.task.title}" — ${reviewNote}`,
  })

  return NextResponse.json({ ok: true, status: 'rejected' })
}
