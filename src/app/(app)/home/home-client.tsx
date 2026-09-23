'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRightLeft, CalendarDays, LogOut, Play, Search } from 'lucide-react'
import { Button, ErrorNote, FieldLabel, Input, Select, Spinner, Textarea } from '@/components/ui'
import { Sheet } from '@/components/sheet'
import { OverdueBadge, PriorityBadge, STATUS_META } from '@/components/task-bits'
import { apiSend, fetcher } from '@/lib/client'
import { useElapsedSeconds } from '@/hooks/use-elapsed'
import { formatDateShortWIB, formatTimer, formatWIB } from '@/lib/time'
import type { TimeEntryItem } from '@/lib/time-entries'
import type { TaskItem } from '@/lib/tasks'

const CHECKOUT_STATUS = ['in_progress', 'review', 'done', 'todo'] as const

export function HomeClient() {
  const activeReq = useSWR<{ entry: TimeEntryItem | null }>('/api/time-entries/active', fetcher, {
    refreshInterval: 30_000,
  })
  const tasksReq = useSWR<{ tasks: TaskItem[] }>('/api/tasks/available', fetcher)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  const active = activeReq.data?.entry ?? null
  const tasks = useMemo(() => tasksReq.data?.tasks ?? [], [tasksReq.data])

  async function refreshAll() {
    await Promise.all([activeReq.mutate(), tasksReq.mutate()])
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="font-heading text-[22px] font-extrabold">Waktu Kerja</h1>
        <p className="mt-1 text-sm text-ink-500">
          {active ? 'Sesi berjalan — jangan lupa clock out setelah selesai' : 'Pilih task lalu clock in untuk mulai mencatat jam'}
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
        <RunningCard
          entry={active}
          onSwitch={() => setSwitchOpen(true)}
          onClockOut={() => setCheckoutOpen(true)}
        />
      ) : (
        <IdleCard
          tasks={tasks}
          loading={tasksReq.isLoading}
          error={tasksReq.error}
          onStart={() => setPickerOpen(true)}
        />
      )}

      {!active && tasks.length > 0 && !tasksReq.isLoading && (
        <div className="mt-6 rounded-lg border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-[14px] font-bold text-ink-900">Task yang bisa dikerjakan</h2>
            <Link href="/bucket" className="text-[12.5px] font-bold text-brand-1 hover:underline">
              Lihat semua
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-line-soft">
            {tasks.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-bold text-ink-900">{t.title}</p>
                  <p className="mt-0.5 text-[12px] text-ink-500">
                    {t.project.name} · {t.workType.name}
                    {!t.assignee && ' · Bucket Bersama'}
                  </p>
                </div>
                <span className="shrink-0 text-[12px] text-ink-400">{formatDateShortWIB(t.deadlineAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pickerOpen && (
        <TaskPickerSheet
          tasks={tasks}
          title="Mulai Kerja"
          submitLabel="Clock In"
          onSubmit={async (taskId) => apiSend('/api/time-entries/clock-in', 'POST', { taskId })}
          onClose={() => setPickerOpen(false)}
          onDone={async () => {
            await refreshAll()
          }}
          onError={setBanner}
        />
      )}

      {switchOpen && active && (
        <TaskPickerSheet
          tasks={tasks}
          title="Switch Task"
          description={`Sedang: ${active.task.title}`}
          submitLabel="Pindah"
          excludeTaskId={active.task.id}
          withNote
          onSubmit={async (taskId, note) =>
            apiSend('/api/time-entries/switch', 'POST', { taskId, note: note || null })
          }
          onClose={() => setSwitchOpen(false)}
          onDone={async () => {
            await refreshAll()
          }}
          onError={setBanner}
        />
      )}

      {checkoutOpen && active && (
        <ClockOutSheet
          entry={active}
          onClose={() => setCheckoutOpen(false)}
          onDone={async () => {
            await refreshAll()
          }}
          onError={setBanner}
        />
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

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-md">
      <div className="flex items-center gap-2 border-b border-line-soft bg-brand-soft/60 px-5 py-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-1 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-1" />
        </span>
        <span className="text-[12px] font-extrabold uppercase tracking-wide text-brand-1">
          Sedang berjalan
        </span>
        <span className="ml-auto text-[12px] font-semibold text-ink-500">
          Mulai {formatWIB(entry.clockInAt, 'HH.mm')}
        </span>
      </div>

      <div className="px-5 py-7 text-center">
        <p className="font-mono text-[42px] font-extrabold leading-none tracking-tight text-ink-900 tabular-nums">
          {formatTimer(seconds)}
        </p>

        <h2 className="mt-5 font-heading text-[18px] font-extrabold text-ink-900">{entry.task.title}</h2>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] text-ink-500">
          <span className="font-semibold text-ink-700">{entry.task.project.name}</span>
          <span aria-hidden>·</span>
          <span>{entry.task.workType.name}</span>
          <span aria-hidden>·</span>
          <span>Requester: {entry.task.requester.name}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-line px-5 py-4 sm:flex-row">
        <Button variant="secondary" className="flex-1" onClick={onSwitch}>
          <ArrowRightLeft className="h-4 w-4" /> Switch Task
        </Button>
        <Button className="flex-1" onClick={onClockOut}>
          <LogOut className="h-4 w-4" /> Clock Out
        </Button>
      </div>
    </div>
  )
}

function IdleCard({
  tasks,
  loading,
  error,
  onStart,
}: {
  tasks: TaskItem[]
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
        Pilih task yang akan dikerjakan, lalu clock in. Task tanpa assignee akan otomatis menjadi milik Anda.
      </p>
      {error ? (
        <p className="mt-4 text-[13px] font-semibold text-pri-high">
          {error instanceof Error ? error.message : 'Gagal memuat task'}
        </p>
      ) : (
        <Button className="mt-5" onClick={onStart} disabled={loading || tasks.length === 0}>
          {loading ? <Spinner /> : <Play className="h-4 w-4" />} Clock In
        </Button>
      )}
      {!loading && !error && tasks.length === 0 && (
        <p className="mt-3 text-[12.5px] text-ink-400">
          Belum ada task yang bisa dikerjakan.{' '}
          <Link href="/bucket" className="font-bold text-brand-1 hover:underline">
            Lihat Task Bucket
          </Link>
        </p>
      )}
    </div>
  )
}

function TaskPickerSheet({
  tasks,
  title,
  description,
  submitLabel,
  excludeTaskId,
  withNote,
  onSubmit,
  onClose,
  onDone,
  onError,
}: {
  tasks: TaskItem[]
  title: string
  description?: string
  submitLabel: string
  excludeTaskId?: string
  withNote?: boolean
  onSubmit: (taskId: string, note?: string) => Promise<unknown>
  onClose: () => void
  onDone: () => Promise<void>
  onError: (msg: string | null) => void
}) {
  const [q, setQ] = useState('')
  const candidates = tasks.filter((t) => t.id !== excludeTaskId)
  const visible = candidates.filter(
    (t) =>
      q.trim() === '' ||
      t.title.toLowerCase().includes(q.trim().toLowerCase()) ||
      t.project.name.toLowerCase().includes(q.trim().toLowerCase())
  )

  const [selected, setSelected] = useState<string | null>(
    candidates.length === 1 ? candidates[0].id : null
  )
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!selected) {
      setError('Pilih salah satu task dulu.')
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
            placeholder="Cari judul task atau project…"
            className="pl-9"
          />
        </div>

        {visible.length === 0 ? (
          <p className="rounded-lg bg-surface-2 px-4 py-8 text-center text-[13px] font-semibold text-ink-500">
            {candidates.length === 0 ? 'Tidak ada task lain yang tersedia.' : 'Task tidak ditemukan.'}
          </p>
        ) : (
          <ul className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            {visible.map((t) => {
              const picked = selected === t.id
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(t.id)}
                    className={`w-full rounded-md border p-3.5 text-left transition ${
                      picked
                        ? 'border-brand-1 bg-brand-soft/60 ring-1 ring-brand-1'
                        : 'border-line bg-surface hover:bg-surface-2'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13.5px] font-bold text-ink-900">{t.title}</span>
                      {t.overdue && <OverdueBadge />}
                    </div>
                    <p className="mt-1 text-[12px] text-ink-500">
                      {t.project.name} · {t.workType.name} · {t.requester.name}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={t.priority} />
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-500">
                        <CalendarDays className="h-3.5 w-3.5" /> {formatDateShortWIB(t.deadlineAt)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-ink-700">
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[t.status].dot}`} />
                        {STATUS_META[t.status].label}
                      </span>
                      {!t.assignee && (
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-brand-1">
                          Bucket Bersama
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
              placeholder="Ringkasan singkat sebelum pindah task"
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

function ClockOutSheet({
  entry,
  onClose,
  onDone,
  onError,
}: {
  entry: TimeEntryItem
  onClose: () => void
  onDone: () => Promise<void>
  onError: (msg: string | null) => void
}) {
  const seconds = useElapsedSeconds(entry.clockInAt)
  const [note, setNote] = useState('')
  const [taskStatus, setTaskStatus] = useState<string>('in_progress')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const remaining = 10 - note.trim().length

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      await apiSend('/api/time-entries/clock-out', 'POST', { note: note.trim(), taskStatus })
      await onDone()
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal clock out'
      setError(msg)
      onError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title="Clock Out" description={entry.task.title}>
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-2 px-4 py-3.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-ink-500">Durasi sesi ini</p>
          <p className="mt-1 font-mono text-[24px] font-extrabold text-ink-900 tabular-nums">
            {formatTimer(seconds)}
          </p>
        </div>

        <div>
          <FieldLabel htmlFor="co-note">Catatan pekerjaan</FieldLabel>
          <Textarea
            id="co-note"
            required
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Apa yang dikerjakan pada sesi ini? (minimal 10 karakter)"
          />
          <p className={`mt-1.5 text-[12px] font-semibold ${remaining > 0 ? 'text-ink-400' : 'text-pri-low'}`}>
            {remaining > 0 ? `Kurang ${remaining} karakter` : 'Catatan cukup'}
          </p>
        </div>

        <div>
          <FieldLabel htmlFor="co-status">Status task setelah sesi ini</FieldLabel>
          <Select id="co-status" value={taskStatus} onChange={(e) => setTaskStatus(e.target.value)}>
            {CHECKOUT_STATUS.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={saving} disabled={note.trim().length < 10}>
            Clock Out
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
