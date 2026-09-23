'use client'

// Halaman Koreksi Saya (Fase 6 / F6): daftar pengajuan koreksi freelancer +
// form pengajuan koreksi untuk sesi kerja yang sudah tercatat.
import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { ClipboardCheck, PencilLine, Plus } from 'lucide-react'
import { Button, ErrorNote, FieldLabel, Input, Select, Spinner, Textarea } from '@/components/ui'
import { Sheet } from '@/components/sheet'
import { apiSend, fetcher } from '@/lib/client'
import { dateToWibLocal, formatMinutes, formatWIB } from '@/lib/time'
import type { CorrectionItem } from '@/lib/corrections'
import type { TimeEntryItem } from '@/lib/time-entries'

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'pending', label: 'Menunggu' },
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

export function MyCorrectionsClient() {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [composer, setComposer] = useState<TimeEntryItem | null>(null)
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const key = filter === 'all' ? '/api/corrections' : `/api/corrections?status=${filter}`
  const listReq = useSWR<{ corrections: CorrectionItem[]; pending: number }>(key, fetcher)

  // Untuk pilihan sesi yang bisa dikoreksi (termasuk sesi berjalan)
  const entriesReq = useSWR<{ entries: TimeEntryItem[] }>('/api/time-entries', fetcher)

  const items = useMemo(() => listReq.data?.corrections ?? [], [listReq.data])
  const pendingEntryIds = useMemo(
    () => new Set(items.filter((c) => c.status === 'pending').map((c) => c.timeEntryId)),
    [items]
  )

  const candidates = useMemo(() => {
    const oneWeekAgo = Date.now() - 7 * 86_400_000
    return (entriesReq.data?.entries ?? []).filter(
      (e) => new Date(e.clockInAt).getTime() >= oneWeekAgo
    )
  }, [entriesReq.data])

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-extrabold">Koreksi Saya</h1>
          <p className="mt-1 text-sm text-ink-500">
            Lupa clock out atau salah task? Ajukan koreksi — admin akan meninjau usulan Anda
          </p>
        </div>
        <Button onClick={() => setComposer(candidates[0] ?? null)} disabled={candidates.length === 0}>
          <Plus className="h-4 w-4" /> Ajukan Koreksi
        </Button>
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
            <p className="mt-3 text-sm font-bold text-ink-700">Belum ada pengajuan koreksi</p>
            <p className="mt-1 text-sm text-ink-500">
              Pengajuan Anda akan tampil di sini beserta status persetujuannya.
            </p>
          </div>
        ) : (
          items.map((c) => <CorrectionCard key={c.id} item={c} />)
        )}
      </div>

      {composer && (
        <CorrectionSheet
          entries={candidates}
          selected={composer}
          onSelect={setComposer}
          pendingEntryIds={pendingEntryIds}
          onClose={() => setComposer(null)}
          onDone={async (msg) => {
            await listReq.mutate()
            await entriesReq.mutate()
            setBanner({ type: 'ok', text: msg })
          }}
        />
      )}
    </div>
  )
}

function CorrectionCard({ item }: { item: CorrectionItem }) {
  const c = item.current
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-ink-900">{c.taskTitle}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            {c.project} · {c.workType} · {c.requester}
          </p>
        </div>
        <CorrectionStatusPill status={item.status} />
      </div>

      <div className="mt-3 grid gap-2 rounded-lg bg-surface-2/60 p-3 text-[12.5px] sm:grid-cols-3">
        <div>
          <p className="font-bold uppercase tracking-wide text-ink-400">Saat ini</p>
          <p className="mt-1 text-ink-700">
            {formatWIB(c.clockInAt, 'dd MMM HH.mm')} –{' '}
            {c.active ? 'Berjalan' : formatWIB(c.clockOutAt!, 'dd MMM HH.mm')}
          </p>
          <p className="font-mono text-ink-500">{formatMinutes(c.minutes)}</p>
        </div>
        {item.proposed.clockInAt && (
          <div>
            <p className="font-bold uppercase tracking-wide text-brand-1">Usulan Jam Masuk</p>
            <p className="mt-1 text-ink-900">{formatWIB(item.proposed.clockInAt, 'dd MMM HH.mm')}</p>
          </div>
        )}
        {item.proposed.clockOutAt && (
          <div>
            <p className="font-bold uppercase tracking-wide text-brand-1">Usulan Jam Keluar</p>
            <p className="mt-1 text-ink-900">{formatWIB(item.proposed.clockOutAt, 'dd MMM HH.mm')}</p>
          </div>
        )}
        {item.proposed.taskId && (
          <div>
            <p className="font-bold uppercase tracking-wide text-brand-1">Usulan Task</p>
            <p className="mt-1 text-ink-900">
              {item.proposed.taskTitle ?? 'Task tidak diketahui'}
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 text-[12.5px]">
        <p className="italic text-ink-500">&ldquo;{item.reason}&rdquo;</p>
        <p className="mt-1.5 text-ink-400">
          Diajukan {formatWIB(item.createdAt, 'dd MMM yyyy HH.mm')}
          {item.reviewedBy &&
            ` · direview ${item.reviewedBy.name} pada ${formatWIB(item.reviewedAt!, 'dd MMM yyyy HH.mm')}`}
        </p>
        {item.reviewNote && (
          <p className="mt-1 rounded-md bg-pri-highbg px-3 py-2 font-semibold text-pri-high">
            Catatan admin: {item.reviewNote}
          </p>
        )}
      </div>
    </div>
  )
}

function CorrectionSheet({
  entries,
  selected,
  onSelect,
  pendingEntryIds,
  onClose,
  onDone,
}: {
  entries: TimeEntryItem[]
  selected: TimeEntryItem
  onSelect: (e: TimeEntryItem) => void
  pendingEntryIds: Set<string>
  onClose: () => void
  onDone: (msg: string) => Promise<void>
}) {
  const [entryId, setEntryId] = useState(selected.id)
  const [clockIn, setClockIn] = useState(dateToWibLocal(selected.clockInAt))
  const [clockOut, setClockOut] = useState(
    selected.clockOutAt ? dateToWibLocal(selected.clockOutAt) : ''
  )
  const [taskId, setTaskId] = useState(selected.task.id)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const tasksReq = useSWR<{ tasks: Array<{ id: string; title: string }> }>(
    '/api/tasks/available',
    fetcher
  )

  const entry = entries.find((e) => e.id === entryId) ?? selected
  const alreadyPending = pendingEntryIds.has(entryId)

  function pickEntry(id: string) {
    const e = entries.find((x) => x.id === id)
    if (!e) return
    setEntryId(id)
    onSelect(e)
    setClockIn(dateToWibLocal(e.clockInAt))
    setClockOut(e.clockOutAt ? dateToWibLocal(e.clockOutAt) : '')
    setTaskId(e.task.id)
  }

  async function submit() {
    setSaving(true)
    setErr(null)
    try {
      await apiSend('/api/corrections', 'POST', {
        timeEntryId: entryId,
        newClockInLocal: clockIn,
        newClockOutLocal: clockOut || null,
        newTaskId: taskId,
        reason: reason.trim(),
      })
      await onDone('Pengajuan koreksi terkirim. Menunggu review admin.')
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal mengajukan koreksi')
    } finally {
      setSaving(false)
    }
  }

  const reasonOk = reason.trim().length >= 10

  return (
    <Sheet
      open
      onClose={onClose}
      title="Ajukan Koreksi"
      description="Isi nilai yang seharusnya; biarkan sama bila tidak ingin mengubah"
      size="lg"
    >
      <div className="space-y-4">
        {err && <ErrorNote>{err}</ErrorNote>}

        <div>
          <FieldLabel htmlFor="cor-entry">Sesi kerja</FieldLabel>
          <Select id="cor-entry" value={entryId} onChange={(e) => pickEntry(e.target.value)}>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {formatWIB(e.clockInAt, 'dd MMM HH.mm')} — {e.task.title}
              </option>
            ))}
          </Select>
        </div>

        <div className="rounded-lg bg-surface-2/60 p-3 text-[12.5px] text-ink-500">
          Nilai saat ini: {formatWIB(entry.clockInAt, 'dd MMM yyyy HH.mm')} –{' '}
          {entry.active ? 'berjalan' : formatWIB(entry.clockOutAt!, 'dd MMM yyyy HH.mm')} (
          {entry.durationLabel})
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="cor-in">Jam masuk (WIB)</FieldLabel>
            <Input
              id="cor-in"
              type="datetime-local"
              value={clockIn}
              onChange={(e) => setClockIn(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="cor-out">Jam keluar (WIB)</FieldLabel>
            <Input
              id="cor-out"
              type="datetime-local"
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
            />
            <p className="mt-1.5 text-[12px] text-ink-400">
              Kosongkan bila sesi belum keluar / masih berjalan.
            </p>
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="cor-task">Task</FieldLabel>
          <Select id="cor-task" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            {(tasksReq.data?.tasks ?? [{ id: entry.task.id, title: entry.task.title }]).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <FieldLabel htmlFor="cor-reason">Alasan koreksi</FieldLabel>
          <Textarea
            id="cor-reason"
            required
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: lupa clock out karena laptop mati, seharusnya selesai jam 17.30"
          />
          <p
            className={`mt-1.5 text-[12px] font-semibold ${reasonOk ? 'text-pri-low' : 'text-ink-400'}`}
          >
            Minimal 10 karakter ({reason.trim().length}/10)
          </p>
        </div>

        {alreadyPending && (
          <p className="rounded-lg bg-pri-mediumbg px-3.5 py-2.5 text-[13px] font-semibold text-status-review">
            Sesi ini sudah punya pengajuan koreksi yang menunggu review.
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-line-soft pt-4">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={saving} disabled={!reasonOk || alreadyPending}>
            <PencilLine className="h-4 w-4" /> Kirim Pengajuan
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
