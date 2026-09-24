'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { CalendarDays, Clock, Search } from 'lucide-react'
import { ErrorNote, Input, Spinner } from '@/components/ui'
import { AttachmentList } from '@/components/attachment'
import { StatusPill } from '@/components/task-bits'
import { fetcher } from '@/lib/client'
import { formatMinutes, formatWIB } from '@/lib/time'
import type { TimeEntryItem } from '@/lib/time-entries'

type Range = 'today' | 'week' | 'month' | 'all'

const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'Hari ini' },
  { key: 'week', label: '7 hari' },
  { key: 'month', label: '30 hari' },
  { key: 'all', label: 'Semua' },
]

/** Rentang tanggal (yyyy-MM-dd, WIB) untuk query */
function rangeToDates(range: Range): { from?: string; to?: string } {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' })
  const to = fmt.format(now)
  if (range === 'all') return {}
  if (range === 'today') return { from: to, to }
  const days = range === 'week' ? 6 : 29
  const start = new Date(now.getTime() - days * 86_400_000)
  return { from: fmt.format(start), to }
}

export function MyTimeClient() {
  const [range, setRange] = useState<Range>('week')
  const [q, setQ] = useState('')

  const { from, to } = rangeToDates(range)
  const qs = new URLSearchParams()
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  const key = `/api/time-entries${qs.toString() ? `?${qs}` : ''}`

  const { data, isLoading, error } = useSWR<{
    entries: TimeEntryItem[]
    totalMinutes: number
    workDays: number
  }>(key, fetcher)

  const entries = useMemo(() => data?.entries ?? [], [data])
  const visible = entries.filter(
    (e) =>
      q.trim() === '' ||
      e.task.title.toLowerCase().includes(q.trim().toLowerCase()) ||
      e.task.project.name.toLowerCase().includes(q.trim().toLowerCase())
  )

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <h1 className="font-heading text-[22px] font-extrabold">Jam Kerja Saya</h1>
        <p className="mt-1 text-sm text-ink-500">Riwayat sesi kerja yang tercatat dari clock in/out</p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Total jam"
          value={isLoading ? '…' : formatMinutes(data?.totalMinutes ?? 0)}
        />
        <StatCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Hari dengan entry"
          value={isLoading ? '…' : String(data?.workDays ?? 0)}
        />
        <StatCard
          icon={<Search className="h-4 w-4" />}
          label="Jumlah sesi"
          value={isLoading ? '…' : String(entries.filter((e) => !e.active).length)}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition ${
                range === r.key
                  ? 'bg-brand-1 text-white'
                  : 'bg-surface-2 text-ink-500 ring-1 ring-line hover:text-ink-900'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="ml-auto w-56">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari task / project…" />
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorNote>{error instanceof Error ? error.message : 'Gagal memuat riwayat'}</ErrorNote>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-ink-400">
            <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat riwayat…</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-bold text-ink-700">Belum ada sesi tercatat</p>
            <p className="mt-1 text-sm text-ink-500">
              Mulai catat jam kerja dari{' '}
              <Link href="/home" className="font-bold text-brand-1 hover:underline">
                halaman Home
              </Link>
              .
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-surface-2/60 text-left text-[11px] font-bold uppercase tracking-wider text-ink-400">
                <th className="px-5 py-3">Task</th>
                <th className="px-5 py-3">Mulai</th>
                <th className="px-5 py-3">Selesai</th>
                <th className="px-5 py-3">Durasi</th>
                <th className="px-5 py-3">Status Akhir</th>
                <th className="px-5 py-3">Lampiran</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id} className="border-t border-line align-top transition hover:bg-surface-2/50">
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-ink-900">{e.task.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-500">
                      {e.task.project.name} · {e.task.workType.name}
                    </p>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-ink-700">{formatWIB(e.clockInAt)}</td>
                  <td className="px-5 py-3.5 text-[13px] text-ink-700">
                    {e.active ? (
                      <span className="inline-flex items-center gap-1.5 font-bold text-brand-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-1" /> Berjalan
                      </span>
                    ) : (
                      formatWIB(e.clockOutAt!)
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-[13px] font-bold text-ink-900 tabular-nums">
                    {e.durationLabel}
                  </td>
                  <td className="px-5 py-3.5">
                    {e.taskStatusAtCheckout ? (
                      <StatusPill status={e.taskStatusAtCheckout} />
                    ) : (
                      <span className="text-[12.5px] text-ink-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {e.attachments.length === 0 ? (
                      <span className="text-[12.5px] text-ink-400">—</span>
                    ) : (
                      <AttachmentList items={e.attachments} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-2 text-ink-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-brand-1">
          {icon}
        </span>
        <span className="text-[12px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2.5 font-heading text-[22px] font-extrabold text-ink-900">{value}</p>
    </div>
  )
}
