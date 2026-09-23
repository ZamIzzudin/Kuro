'use client'

// Halaman Review Koreksi (Fase 6 / F6): admin meninjau diff nilai lama vs usulan,
// approve/reject dengan catatan, plus akses edit langsung time entry (Q5).
import { useState } from 'react'
import useSWR from 'swr'
import { ArrowRight, Check, ClipboardCheck, PencilLine, X } from 'lucide-react'
import { Button, ErrorNote, FieldLabel, Input, Select, Spinner, Textarea } from '@/components/ui'
import { Sheet } from '@/components/sheet'
import { apiSend, fetcher } from '@/lib/client'
import { dateToWibLocal, formatMinutes, formatWIB } from '@/lib/time'
import type { CorrectionItem } from '@/lib/corrections'

type StatusFilter = 'pending' | 'all' | 'approved' | 'rejected'

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'pending', label: 'Menunggu' },
  { key: 'all', label: 'Semua' },
  { key: 'approved', label: 'Disetujui' },
  { key: 'rejected', label: 'Ditolak' },
]

const STATUS_META: Record<CorrectionItem['status'], { label: string; chip: string }> = {
  pending: { label: 'Menunggu Review', chip: 'bg-pri-mediumbg text-status-review' },
  approved: { label: 'Disetujui', chip: 'bg-pri-lowbg text-pri-low' },
  rejected: { label: 'Ditolak', chip: 'bg-pri-highbg text-pri-high' },
}

function CorrectionStatusPill({ status }: { status: CorrectionItem['status'] }) {
  const m = STATUS_META[status]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide ${m.chip}`}
    >
      {m.label}
    </span>
  )
}

export function AdminCorrectionsClient() {
  const [filter, setFilter] = useState<StatusFilter>('pending')
  const [rejectTarget, setRejectTarget] = useState<CorrectionItem | null>(null)
  const [editTarget, setEditTarget] = useState<CorrectionItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const key = filter === 'all' ? '/api/corrections' : `/api/corrections?status=${filter}`
  const listReq = useSWR<{ corrections: CorrectionItem[]; pending: number }>(key, fetcher)
  const items = listReq.data?.corrections ?? []

  async function approve(item: CorrectionItem) {
    setBusyId(item.id)
    setBanner(null)
    try {
      await apiSend(`/api/corrections/${item.id}/approve`, 'POST')
      await listReq.mutate()
      setBanner({ type: 'ok', text: `Koreksi ${item.requestedBy.name} disetujui & diterapkan.` })
    } catch (e) {
      setBanner({ type: 'err', text: e instanceof Error ? e.message : 'Gagal menyetujui koreksi' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="font-heading text-[22px] font-extrabold">Review Koreksi</h1>
        <p className="mt-1 text-sm text-ink-500">
          Tinjau usulan perubahan jam kerja, setujui/tolak, atau edit langsung (ter-audit)
        </p>
      </div>

      {banner && (
        <div className="mb-4">
          {banner.type === 'ok' ? (
            <p className="rounded-lg bg-pri-lowbg px-3.5 py-2.5 text-[13px] font-semibold text-pri-low">
              {banner.text}
            </p>
          ) : (
            <ErrorNote>{banner.text}</ErrorNote>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition ${
              filter === f.key
                ? 'bg-brand-1 text-white'
                : 'bg-surface-2 text-ink-500 ring-1 ring-line hover:text-ink-900'
            }`}
          >
            {f.label}
            {f.key === 'pending' && (listReq.data?.pending ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-white/25 px-1.5 text-[11px]">
                {listReq.data?.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {listReq.error && (
        <div className="mb-4">
          <ErrorNote>
            {listReq.error instanceof Error ? listReq.error.message : 'Gagal memuat koreksi'}
          </ErrorNote>
        </div>
      )}

      <div className="space-y-3">
        {listReq.isLoading ? (
          <div className="flex items-center justify-center rounded-xl border border-line bg-surface py-16 text-ink-400">
            <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat koreksi…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface py-16 text-center shadow-sm">
            <ClipboardCheck className="mx-auto h-7 w-7 text-ink-300" />
            <p className="mt-3 text-sm font-bold text-ink-700">Tidak ada koreksi</p>
            <p className="mt-1 text-sm text-ink-500">Belum ada pengajuan pada filter ini.</p>
          </div>
        ) : (
          items.map((item) => (
            <CorrectionReviewCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onApprove={() => approve(item)}
              onReject={() => setRejectTarget(item)}
              onEdit={() => setEditTarget(item)}
            />
          ))
        )}
      </div>

      {rejectTarget && (
        <RejectSheet
          item={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={async () => {
            await listReq.mutate()
            setBanner({ type: 'ok', text: 'Koreksi ditolak.' })
          }}
          onError={(msg) => setBanner({ type: 'err', text: msg })}
        />
      )}

      {editTarget && (
        <EditEntrySheet
          item={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={async () => {
            await listReq.mutate()
            setBanner({ type: 'ok', text: 'Time entry diperbarui (ter-audit).' })
          }}
          onError={(msg) => setBanner({ type: 'err', text: msg })}
        />
      )}
    </div>
  )
}

function CorrectionReviewCard({
  item,
  busy,
  onApprove,
  onReject,
  onEdit,
}: {
  item: CorrectionItem
  busy: boolean
  onApprove: () => void
  onReject: () => void
  onEdit: () => void
}) {
  const c = item.current
  const pending = item.status === 'pending'

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-ink-900">{c.taskTitle}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            {item.requestedBy.name} · {c.project} · {c.workType} · {c.requester}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {c.locked && (
            <span className="rounded-full bg-pri-mediumbg px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-status-review">
              Periode Terkunci
            </span>
          )}
          <CorrectionStatusPill status={item.status} />
        </div>
      </div>

      {/* Diff lama vs usulan */}
      <div className="mt-3 overflow-hidden rounded-lg border border-line">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-surface-2/60 text-left font-bold uppercase tracking-wide text-ink-400">
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">Nilai Saat Ini</th>
              <th className="w-8 px-2 py-2" />
              <th className="px-3 py-2">Usulan</th>
            </tr>
          </thead>
          <tbody>
            <DiffRow
              label="Jam Masuk"
              current={formatWIB(c.clockInAt, 'dd MMM yyyy HH.mm')}
              proposed={item.proposed.clockInAt ? formatWIB(item.proposed.clockInAt, 'dd MMM yyyy HH.mm') : null}
            />
            <DiffRow
              label="Jam Keluar"
              current={c.active ? 'Berjalan' : formatWIB(c.clockOutAt!, 'dd MMM yyyy HH.mm')}
              proposed={item.proposed.clockOutAt ? formatWIB(item.proposed.clockOutAt, 'dd MMM yyyy HH.mm') : null}
            />
            <DiffRow
              label="Task"
              current={c.taskTitle}
              proposed={item.proposed.taskId ? item.proposed.taskTitle ?? 'Task tidak diketahui' : null}
            />
            <tr className="border-t border-line-soft">
              <td className="px-3 py-2 font-semibold text-ink-500">Durasi</td>
              <td className="px-3 py-2 font-mono text-ink-700">{formatMinutes(c.minutes)}</td>
              <td className="px-2 py-2 text-center text-ink-300">
                <ArrowRight className="mx-auto h-3.5 w-3.5" />
              </td>
              <td className="px-3 py-2 font-mono text-ink-900">
                {proposedDuration(item) ?? <span className="text-ink-300">—</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12.5px] italic text-ink-500">Alasan: &ldquo;{item.reason}&rdquo;</p>
      <p className="mt-1 text-[12px] text-ink-400">
        Diajukan {formatWIB(item.createdAt, 'dd MMM yyyy HH.mm')}
        {item.reviewedBy &&
          ` · direview ${item.reviewedBy.name} pada ${formatWIB(item.reviewedAt!, 'dd MMM yyyy HH.mm')}`}
        {item.status === 'approved' && ' · sudah diterapkan'}
      </p>
      {item.reviewNote && (
        <p className="mt-1.5 rounded-md bg-pri-highbg px-3 py-2 text-[12.5px] font-semibold text-pri-high">
          Catatan admin: {item.reviewNote}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
        {pending ? (
          <>
            <Button size="sm" onClick={onApprove} loading={busy} disabled={c.locked}>
              <Check className="h-4 w-4" /> Setujui
            </Button>
            <Button size="sm" variant="danger" onClick={onReject} disabled={busy}>
              <X className="h-4 w-4" /> Tolak
            </Button>
          </>
        ) : (
          <span className="text-[12.5px] text-ink-400">Sudah direview</span>
        )}
        <Button size="sm" variant="secondary" className="ml-auto" onClick={onEdit}>
          <PencilLine className="h-4 w-4" /> Edit Langsung
        </Button>
      </div>

      {pending && c.locked && (
        <p className="mt-2 text-[12px] font-semibold text-status-review">
          Periode entri ini terkunci — buka kunci di halaman Rekap &amp; Export sebelum menyetujui.
        </p>
      )}
    </div>
  )
}

function DiffRow({
  label,
  current,
  proposed,
}: {
  label: string
  current: string
  proposed: string | null
}) {
  return (
    <tr className="border-t border-line-soft">
      <td className="px-3 py-2 font-semibold text-ink-500">{label}</td>
      <td className="px-3 py-2 text-ink-700">{current}</td>
      <td className="px-2 py-2 text-center">
        {proposed ? (
          <ArrowRight className="mx-auto h-3.5 w-3.5 text-brand-1" />
        ) : (
          <span className="text-ink-300">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {proposed ? (
          <span className="font-bold text-brand-1">{proposed}</span>
        ) : (
          <span className="text-ink-400">tidak diubah</span>
        )}
      </td>
    </tr>
  )
}

/** Perkiraan durasi setelah usulan diterapkan (menit) */
function proposedDuration(item: CorrectionItem): string | null {
  const inAt = item.proposed.clockInAt ?? item.current.clockInAt
  const outAt = item.proposed.clockOutAt ?? item.current.clockOutAt
  if (!outAt) return null
  const minutes = Math.max(
    0,
    Math.floor((new Date(outAt).getTime() - new Date(inAt).getTime()) / 60_000)
  )
  return formatMinutes(minutes)
}

function RejectSheet({
  item,
  onClose,
  onDone,
  onError,
}: {
  item: CorrectionItem
  onClose: () => void
  onDone: () => Promise<void>
  onError: (msg: string) => void
}) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      await apiSend(`/api/corrections/${item.id}/reject`, 'POST', { reviewNote: note.trim() })
      await onDone()
      onClose()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Gagal menolak koreksi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Tolak Koreksi"
      description={`${item.requestedBy.name} · ${item.current.taskTitle}`}
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-2/60 p-3 text-[12.5px] text-ink-600">
          <p className="font-bold text-ink-900">Usulan</p>
          <p className="mt-1">
            {item.proposed.clockInAt ? `Masuk → ${formatWIB(item.proposed.clockInAt, 'dd MMM HH.mm')}` : null}
            {item.proposed.clockOutAt ? ` · Keluar → ${formatWIB(item.proposed.clockOutAt, 'dd MMM HH.mm')}` : null}
            {item.proposed.taskId ? ` · Task → ${item.proposed.taskTitle ?? '—'}` : null}
          </p>
          <p className="mt-1 italic text-ink-500">&ldquo;{item.reason}&rdquo;</p>
        </div>

        <div>
          <FieldLabel htmlFor="rej-note">Catatan review</FieldLabel>
          <Textarea
            id="rej-note"
            required
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Jelaskan alasan penolakan agar freelancer bisa memperbaiki"
          />
          <p className={`mt-1.5 text-[12px] font-semibold ${note.trim().length < 5 ? 'text-ink-400' : 'text-pri-low'}`}>
            Minimal 5 karakter
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button variant="danger" onClick={submit} loading={saving} disabled={note.trim().length < 5}>
            <X className="h-4 w-4" /> Tolak Koreksi
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

function EditEntrySheet({
  item,
  onClose,
  onDone,
  onError,
}: {
  item: CorrectionItem
  onClose: () => void
  onDone: () => Promise<void>
  onError: (msg: string) => void
}) {
  const c = item.current
  const [clockIn, setClockIn] = useState(dateToWibLocal(c.clockInAt))
  const [clockOut, setClockOut] = useState(c.clockOutAt ? dateToWibLocal(c.clockOutAt) : '')
  const [note, setNote] = useState(c.note ?? '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const tasksReq = useSWR<{ tasks: Array<{ id: string; title: string }> }>(
    '/api/tasks/available',
    fetcher
  )
  const [taskId, setTaskId] = useState(c.taskId)

  async function submit() {
    setSaving(true)
    setErr(null)
    try {
      await apiSend(`/api/time-entries/${c.id}`, 'PATCH', {
        clockInLocal: clockIn,
        clockOutLocal: clockOut || null,
        taskId,
        note: note || null,
        reason: reason.trim(),
      })
      await onDone()
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal menyimpan perubahan'
      setErr(msg)
      onError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit Time Entry"
      description={`${item.requestedBy.name} · ${c.taskTitle}`}
      size="lg"
    >
      <div className="space-y-4">
        {err && <ErrorNote>{err}</ErrorNote>}

        <p className="rounded-lg bg-pri-mediumbg px-3.5 py-3 text-[13px] font-semibold text-status-review">
          Edit langsung tidak butuh approval, tetapi tercatat lengkap di activity log (nilai lama & baru).
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="ed-in">Jam masuk (WIB)</FieldLabel>
            <Input id="ed-in" type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="ed-out">Jam keluar (WIB)</FieldLabel>
            <Input
              id="ed-out"
              type="datetime-local"
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
            />
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="ed-task">Task</FieldLabel>
          <Select id="ed-task" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            {(tasksReq.data?.tasks ?? [{ id: c.taskId, title: c.taskTitle }]).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <FieldLabel htmlFor="ed-note">Catatan sesi</FieldLabel>
          <Textarea id="ed-note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div>
          <FieldLabel htmlFor="ed-reason">Alasan edit</FieldLabel>
          <Textarea
            id="ed-reason"
            required
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: memperbaiki jam keluar sesuai laporan klien"
          />
          <p className={`mt-1.5 text-[12px] font-semibold ${reason.trim().length < 5 ? 'text-ink-400' : 'text-pri-low'}`}>
            Minimal 5 karakter
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={saving} disabled={reason.trim().length < 5}>
            Simpan Perubahan
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
