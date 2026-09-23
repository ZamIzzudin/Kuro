// DELETE /api/period-locks/:id — buka kunci periode (wajib alasan; ter-audit) — admin only
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api-helpers'
import { requireApiUser } from '@/lib/auth'
import { periodLabel } from '@/lib/time'
import { periodLockDeleteSchema } from '@/lib/validators'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { user: admin, error } = await requireApiUser(['admin'])
  if (error) return error

  const parsed = await parseJson(req, periodLockDeleteSchema)
  if (parsed.error) return parsed.error
  const { reason } = parsed.data

  const before = await db.periodLock.findUnique({ where: { id: params.id } })
  if (!before) return NextResponse.json({ error: 'Periode terkunci tidak ditemukan.' }, { status: 404 })

  await db.periodLock.delete({ where: { id: params.id } })

  const label = periodLabel(before.year, before.month)
  await logActivity({
    userId: admin.id,
    action: 'period_unlocked',
    entityType: 'period_lock',
    entityId: before.id,
    oldValue: { year: before.year, month: before.month, note: before.note },
    newValue: { reason },
    description: `${admin.name} membuka kunci periode ${label} — alasan: ${reason}`,
  })

  return NextResponse.json({ ok: true })
}
