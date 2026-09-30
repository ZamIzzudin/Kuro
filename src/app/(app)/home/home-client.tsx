'use client'

// Home freelancer — clock in/out terhadap SUBTASK (unit kerja terdalam).
// Satu sesi aktif per user; subtask yang dikerjakan harus berada di sprint aktif.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRightLeft, CalendarDays, LogOut, Play, Search } from 'lucide-react'
import { Button, ErrorNote, FieldLabel, Input, Spinner, Textarea } from '@/components/ui'
import { Sheet } from '@/components/sheet'
import { OverdueBadge, PriorityBadge, STATUS_META } from '@/components/task-bits'
import { ClockOutSheet } from '@/components/clock-out-sheet'
import { useProjectScope } from '@/components/project-scope'
import { apiSend, fetcher } from '@/lib/client'
import { useElapsedSeconds } from '@/hooks/use-elapsed'
import { formatDateShortWIB, formatTimer, formatWIB } from '@/lib/time'
import type { TimeEntryItem } from '@/lib/time-entries'
import type { SubtaskItem, TaskItem } from '@/lib/tasks'

type AvailableSubtask = SubtaskItem & {
  task: Pick<TaskItem, 'id' | 'title' | 'priority' | 'deadlineAt' | 'overdue' | 'workType' | 'requester' | 'project' | 'sprint'>
}

export function HomeClient() {
  const activeReq = useSWR<{ entry: TimeEntryItem | null }>('/api/time-entries/active', fetcher, {
    refreshInterval: 30_000,
  })
  const { projectId } = useProjectScope()
  const subsReq = useSWR<{ subtasks: AvailableSubtask[] }>(
    projectId ? `/api/subtasks/available?projectId=${projectId}` : '/api/subtasks/available',
    fetcher
  )

  const [pickerOpen, setPickerOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  const active = activeReq.data?.entry ?? null
  const subtasks = useMemo(() => subsReq.data?.subtasks ?? [], [subsReq.data])

  async function refreshAll() {
    await Promise.all([activeReq.mutate(), subsReq.mutate()])
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="font-heading text-[22px] font-extrabold">Waktu Kerja</h1>
        <p className="mt-1 text-sm text-ink-500">
          {active
            ? 'Sesi berjalan — jangan lupa clock out setelah selesai'
            : 'Pilih subtask lalu clock in untuk mulai mencatat jam'}
        </p>
      </div>

      {banner && (
        <div className="mb-4">
          <ErrorNote>{banner}</ErrorNote>
        </div>
      )}

      {activeReq.isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-line bg-surface py-20 text-ink-400 shadow-sm">
          <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat sesi…</span>
        </div>
      ) : active ? (
        <RunningCard entry={active} onSwitch={() => setSwitchOpen(true)} onClockOut={() => setCheckoutOpen(true)} />
      ) : (
        <IdleCard
          subtasks={subtasks}
          loading={subsReq.isLoading}
          error={subsReq.error}
          onStart={() => setPickerOpen(true)}
        />
      )}

      {!active && subtasks.length > 0 && !subsReq.isLoading && (
        <div className="mt-6 rounded-lg border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-[14px] font-bold text-ink-900">Subtask yang bisa dikerjakan</h2>
            <Link href="/bucket" className="text-[12.5px] font-bold text-brand-1 hover:underline">
              Lihat semua
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-line-soft">
            {subtasks.slice(0, 5).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-bold text-ink-900">{s.title}</p>
                  <p className="mt-0.5 truncate text-[12px] text-ink-500">
                    {s.task.title} · {s.task.project.name}
                    {!s.assignee && ' · Bisa diambil'}
                  </p>
                </div>
                <span className="shrink-0 text-[12px] text-ink-400">{formatDateShortWIB(s.task.deadlineAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pickerOpen && (
        <SubtaskPickerSheet
          subtasks={subtasks}
          title="Mulai Kerja"
          submitLabel="Clock In"
          onSubmit={async (subtaskId) => apiSend('/api/time-entries/clock-in', 'POST', { subtaskId })}
          onClose={() => setPickerOpen(false)}
          onDone={refreshAll}
          onError={setBanner}
        />
      )}

      {switchOpen && active && (
        <SubtaskPickerSheet
          subtasks={subtasks}
          title="Switch Subtask"
          description={`Sedang: ${active.subtask.title}`}
          submitLabel="Pindah"
          excludeId={active.subtask.id}
          withNote
          onSubmit={async (subtaskId, note) =>
            apiSend('/api/time-entries/switch', 'POST', { subtaskId, note: note || null })
          }
          onClose={() => setSwitchOpen(false)}
          onDone={refreshAll}
          onError={setBanner}
        />
      )}

      {checkoutOpen && active && (
        <ClockOutSheet entry={active} onClose={() => setCheckoutOpen(false)} onDone={refreshAll} onError={setBanner} />
      )}
    </div>
  )
}

function RunningCard({
  entry,
  onSwitch,
  onClockOut,
}: {
  entry: TimeEntryItem
  onSwitch: () => void
  onClockOut: () => void
}) {
  const seconds = useElapsedSeconds(entry.clockInAt)
  const st = entry.subtask

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-md">
      <div className="flex items-center gap-2 border-b border-line-soft bg-brand-soft/60 px-5 py-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-1 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-1" />
        </span>
        <span className="text-[12px] font-extrabold uppercase tracking-wide text-brand-1">Sedang berjalan</span>
        <span className="ml-auto text-[12px] font-semibold text-ink-500">
          Mulai {formatWIB(entry.clockInAt, 'HH.mm')}
        </span>
      </div>

      <div className="px-5 py-7 text-center">
        <p className="text-[42px] font-extrabold leading-none tracking-tight text-ink-900 tabular-nums">
          {formatTimer(seconds)}
        </p>

        <h2 className="mt-5 font-heading text-[18px] font-extrabold text-ink-900">{st.title}</h2>
        <p className="mt-1 text-[13px] font-semibold text-ink-500">Task: {st.taskTitle}</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] text-ink-500">
          <span className="font-semibold text-ink-700">{st.project.name}</span>
          <span aria-hidden>·</span>
          <span>{st.workType.name}</span>
          <span aria-hidden>·</span>
          <span>Requester: {st.requester.name}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-line px-5 py-4 sm:flex-row">
        <Button variant="secondary" className="flex-1" onClick={onSwitch}>
          <ArrowRightLeft className="h-4 w-4" /> Switch Subtask
        </Button>
        <Button className="flex-1" onClick={onClockOut}>
          <LogOut className="h-4 w-4" /> Clock Out
        </Button>
      </div>
    </div>
  )
}

function IdleCard({
  subtasks,
  loading,
  error,
  onStart,
}: {
  subtasks: AvailableSubtask[]
  loading: boolean
  error: unknown
  onStart: () => void
}) {
  return (
    <div className="rounded-xl border-[1.5px] border-dashed border-line bg-surface px-5 py-12 text-center">
      <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-brand-soft text-brand-1">
        <Play className="h-6 w-6" strokeWidth={2} />
      </div>
      <h3 className="font-heading text-[16px] font-bold text-ink-900">Belum ada sesi berjalan</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
        Pilih subtask yang akan dikerjakan, lalu clock in. Subtask tanpa assignee akan otomatis menjadi milik Anda.
      </p>
      {error ? (
        <p className="mt-4 text-[13px] font-semibold text-pri-high">
          {error instanceof Error ? error.message : 'Gagal memuat subtask'}
        </p>
      ) : (
        <Button className="mt-5" onClick={onStart} disabled={loading || subtasks.length === 0}>
          {loading ? <Spinner /> : <Play className="h-4 w-4" />} Clock In
        </Button>
      )}
      {!loading && !error && subtasks.length === 0 && (
        <p className="mt-3 text-[12.5px] text-ink-400">
          Belum ada subtask yang bisa dikerjakan.{' '}
          <Link href="/bucket" className="font-bold text-brand-1 hover:underline">
            Lihat Task Bucket
          </Link>
        </p>
      )}
    </div>
  )
}

function SubtaskPickerSheet({
  subtasks,
  title,
  description,
  submitLabel,
  excludeId,
  withNote,
  onSubmit,
  onClose,
  onDone,
  onError,
}: {
  subtasks: AvailableSubtask[]
  title: string
  description?: string
  submitLabel: string
  excludeId?: string
  withNote?: boolean
  onSubmit: (subtaskId: string, note?: string) => Promise<unknown>
  onClose: () => void
  onDone: () => Promise<void>
  onError: (msg: string | null) => void
}) {
  const [q, setQ] = useState('')
  const candidates = subtasks.filter((s) => s.id !== excludeId)
  const visible = candidates.filter(
    (s) =>
      q.trim() === '' ||
      s.title.toLowerCase().includes(q.trim().toLowerCase()) ||
      s.task.title.toLowerCase().includes(q.trim().toLowerCase()) ||
      s.task.project.name.toLowerCase().includes(q.trim().toLowerCase())
  )

  const [selected, setSelected] = useState<string | null>(candidates.length === 1 ? candidates[0].id : null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!selected) {
      setError('Pilih salah satu subtask dulu.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit(selected, withNote ? note.trim() : undefined)
      await onDone()
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal memulai sesi'
      setError(msg)
      onError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={title} description={description} size="lg">
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari subtask, task, atau project…"
            className="pl-9"
          />
        </div>

        {visible.length === 0 ? (
          <p className="rounded-lg bg-surface-2 px-4 py-8 text-center text-[13px] font-semibold text-ink-500">
            {candidates.length === 0 ? 'Tidak ada subtask lain yang tersedia.' : 'Subtask tidak ditemukan.'}
          </p>
        ) : (
          <ul className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            {visible.map((s) => {
              const picked = selected === s.id
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(s.id)}
                    className={`w-full rounded-md border p-3.5 text-left transition ${
                      picked ? 'border-brand-1 bg-brand-soft/60 ring-1 ring-brand-1' : 'border-line bg-surface hover:bg-surface-2'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13.5px] font-bold text-ink-900">{s.title}</span>
                      {s.task.overdue && <OverdueBadge />}
                    </div>
                    <p className="mt-1 truncate text-[12px] text-ink-500">
                      {s.task.title} · {s.task.project.name} · {s.task.requester.name}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={s.task.priority} />
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-500">
                        <CalendarDays className="h-3.5 w-3.5" /> {formatDateShortWIB(s.task.deadlineAt)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-ink-700">
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s.status].dot}`} />
                        {STATUS_META[s.status].label}
                      </span>
                      {!s.assignee && (
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-brand-1">
                          Bisa diambil
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {withNote && (
          <div>
            <FieldLabel htmlFor="sw-note">Catatan (opsional)</FieldLabel>
            <Textarea
              id="sw-note"
              rows={2}
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ringkasan singkat sebelum pindah subtask"
            />
          </div>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={saving} disabled={!selected}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

