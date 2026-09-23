'use client'

// Dashboard admin (Fase 4 / F4) — live status, ringkasan, chart 30 hari,
// activity feed, task per status & overdue. Polling 30 detik via SWR.
import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Clock,
  ListChecks,
  RefreshCw,
  Timer,
  UserCheck,
} from 'lucide-react'
import type { TaskStatus } from '@prisma/client'
import { Button, Spinner } from '@/components/ui'
import { STATUS_META } from '@/components/task-bits'
import { fetcher } from '@/lib/client'
import { useElapsedSeconds } from '@/hooks/use-elapsed'
import { formatDateShortWIB, formatMinutes, formatTimer, formatWIB } from '@/lib/time'
import type { ChartResponse, DashboardSummary, FeedItem, LiveSession } from '@/lib/dashboard'

const POLL = 30_000

/** Warna seri per user (hex agar aman untuk recharts) */
const SERIES_COLORS = ['#8B2FF2', '#2F6FED', '#1FB673', '#F0932B', '#D926C8', '#9291A0', '#EF4444']

const ACTION_META: Record<string, string> = {
  clock_in: 'Clock In',
  clock_out: 'Clock Out',
  switch_task: 'Switch Task',
  task_created: 'Task Baru',
  task_updated: 'Task Diubah',
  task_assigned: 'Task Di-assign',
  task_status_changed: 'Status Task',
  user_created: 'User Baru',
  user_updated: 'User Diubah',
  user_password_reset_by_admin: 'Reset Password',
  master_created: 'Master Baru',
  master_updated: 'Master Diubah',
  time_entry_edited: 'Entry Diedit',
  auth_login: 'Login',
  auth_logout: 'Logout',
}

export function DashboardClient() {
  const liveReq = useSWR<{ sessions: LiveSession[] }>('/api/dashboard/live', fetcher, {
    refreshInterval: POLL,
  })
  const summaryReq = useSWR<DashboardSummary>('/api/dashboard/summary', fetcher, {
    refreshInterval: POLL,
  })
  const chartReq = useSWR<ChartResponse>('/api/dashboard/chart?days=30', fetcher, {
    refreshInterval: POLL,
  })
  const feedReq = useSWR<{ items: FeedItem[]; nextCursor: string | null }>(
    '/api/dashboard/feed?take=15',
    fetcher,
    { refreshInterval: POLL }
  )

  const [extra, setExtra] = useState<FeedItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const sessions = liveReq.data?.sessions ?? []
  const summary = summaryReq.data
  const feed = [...(feedReq.data?.items ?? []), ...extra]
  const moreCursor = cursor ?? feedReq.data?.nextCursor ?? null

  async function loadMore() {
    if (!moreCursor) return
    setLoadingMore(true)
    try {
      const res = await fetcher<{ items: FeedItem[]; nextCursor: string | null }>(
        `/api/dashboard/feed?take=15&cursor=${moreCursor}`
      )
      setExtra((prev) => [...prev, ...res.items])
      setCursor(res.nextCursor)
    } catch {
      /* biarkan senyap; tombol bisa dicoba lagi */
    } finally {
      setLoadingMore(false)
    }
  }

  function refreshAll() {
    liveReq.mutate()
    summaryReq.mutate()
    chartReq.mutate()
    feedReq.mutate()
  }

  const anyLoading = liveReq.isLoading || summaryReq.isLoading
  const loadError = liveReq.error || summaryReq.error || chartReq.error || feedReq.error

  return (
    <div className="mx-auto max-w-[1240px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-extrabold">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-500">
            Pantau aktivitas tim secara langsung · diperbarui otomatis tiap 30 detik
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={refreshAll}>
          <RefreshCw className="h-4 w-4" /> Perbarui
        </Button>
      </div>

      {loadError && (
        <p className="mb-4 rounded-lg bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] font-semibold text-[#DC2626]">
          Sebagian data gagal dimuat. Coba perbarui halaman.
        </p>
      )}

      {/* Ringkasan jam + task per status */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="Jam hari ini"
            value={anyLoading ? '…' : formatMinutes(summary?.totals.today ?? 0)}
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="7 hari terakhir"
            value={anyLoading ? '…' : formatMinutes(summary?.totals.week ?? 0)}
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="Bulan ini"
            value={anyLoading ? '…' : formatMinutes(summary?.totals.month ?? 0)}
          />
        </div>

        <div className="rounded-lg border border-line bg-surface p-5 shadow-soft">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-ink-500" />
            <h2 className="font-heading text-[14px] font-bold text-ink-900">Task per Status</h2>
            <span className="ml-auto text-[12.5px] font-bold text-ink-500">
              {summary?.totalTasks ?? 0} total
            </span>
          </div>
          <div className="space-y-2">
            {(['todo', 'in_progress', 'review', 'done', 'cancelled'] as TaskStatus[]).map((s) => {
              const count = summary?.tasksByStatus[s] ?? 0
              const total = summary?.totalTasks ?? 0
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <div key={s}>
                  <div className="flex items-center justify-between text-[12px] font-semibold text-ink-500">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s].dot}`} />
                      {STATUS_META[s].label}
                    </span>
                    <span className="font-extrabold text-ink-700">{count}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-line-soft">
                    <div
                      className={`h-1.5 rounded-full ${STATUS_META[s].dot}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Live status */}
      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-1 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-1" />
          </span>
          <h2 className="font-heading text-[15px] font-bold text-ink-900">Sedang Bekerja</h2>
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11.5px] font-extrabold text-ink-500 ring-1 ring-line">
            {sessions.length} aktif
          </span>
        </div>

        {liveReq.isLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-line bg-surface py-12 text-ink-400">
            <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat status…</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-lg border-[1.5px] border-dashed border-line bg-surface py-10 text-center">
            <UserCheck className="mx-auto h-6 w-6 text-ink-300" />
            <p className="mt-2.5 text-sm font-bold text-ink-700">Belum ada yang clock in</p>
            <p className="mt-0.5 text-[13px] text-ink-500">Sesi kerja yang berjalan akan tampil di sini.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sessions.map((s) => (
              <LiveCard key={s.id} session={s} />
            ))}
          </div>
        )}
      </section>

      {/* Chart 30 hari */}
      <section className="mt-6 rounded-lg border border-line bg-surface p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Activity className="h-4 w-4 text-ink-500" />
          <h2 className="font-heading text-[15px] font-bold text-ink-900">Jam Kerja 30 Hari Terakhir</h2>
          <span className="ml-auto text-[12.5px] text-ink-500">dalam jam (WIB)</span>
        </div>
        {chartReq.isLoading ? (
          <div className="flex h-[280px] items-center justify-center text-ink-400">
            <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat chart…</span>
          </div>
        ) : (chartReq.data?.series.length ?? 0) === 0 ? (
          <div className="flex h-[280px] flex-col items-center justify-center text-center">
            <Activity className="h-6 w-6 text-ink-300" />
            <p className="mt-2.5 text-sm font-bold text-ink-700">Belum ada data jam kerja</p>
            <p className="mt-0.5 text-[13px] text-ink-500">
              Data akan muncul setelah freelancer mulai mencatat jam.
            </p>
          </div>
        ) : (
          <WorkChart chart={chartReq.data!} />
        )}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Activity feed */}
        <section className="rounded-lg border border-line bg-surface p-5 shadow-soft">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-ink-500" />
            <h2 className="font-heading text-[15px] font-bold text-ink-900">Aktivitas Terbaru</h2>
          </div>

          {feedReq.isLoading ? (
            <div className="flex items-center justify-center py-10 text-ink-400">
              <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat feed…</span>
            </div>
          ) : feed.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-500">Belum ada aktivitas.</p>
          ) : (
            <>
              <ol className="relative space-y-3.5 pl-5">
                <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-line" aria-hidden />
                {feed.map((f) => {
                  const label = ACTION_META[f.action]
                  return (
                    <li key={f.id} className="relative">
                      <span
                        className="absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand-1"
                        aria-hidden
                      />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {label && (
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-500 ring-1 ring-line">
                            {label}
                          </span>
                        )}
                        <span className="text-[11.5px] font-semibold text-ink-400">
                          {formatWIB(f.createdAt, 'dd MMM HH.mm')}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] text-ink-700">{f.description}</p>
                    </li>
                  )
                })}
              </ol>
              {moreCursor && (
                <div className="mt-4 border-t border-line-soft pt-3.5 text-center">
                  <Button variant="ghost" size="sm" onClick={loadMore} loading={loadingMore}>
                    Muat lebih banyak
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Overdue */}
        <section className="rounded-lg border border-line bg-surface p-5 shadow-soft">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-pri-high" />
            <h2 className="font-heading text-[15px] font-bold text-ink-900">Task Terlambat</h2>
            <span className="rounded-full bg-pri-highbg px-2.5 py-0.5 text-[11.5px] font-extrabold text-pri-high">
              {summary?.overdue.length ?? 0}
            </span>
            <Link
              href="/admin/tasks"
              className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-bold text-brand-1 hover:underline"
            >
              Kelola <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {summaryReq.isLoading ? (
            <div className="flex items-center justify-center py-10 text-ink-400">
              <Spinner />
            </div>
          ) : (summary?.overdue.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-500">
              Tidak ada task yang melewati tenggat.
            </p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {summary!.overdue.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-bold text-ink-900">{t.title}</p>
                    <p className="mt-0.5 text-[12px] text-ink-500">
                      {t.project} · {t.assignee ?? 'Belum di-assign'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-pri-highbg px-2.5 py-1 text-[11px] font-extrabold text-pri-high">
                    {formatDateShortWIB(t.deadlineAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
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
    <div className="rounded-lg border border-line bg-surface p-5 shadow-soft">
      <div className="flex items-center gap-2 text-ink-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-brand-1">
          {icon}
        </span>
        <span className="text-[12px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2.5 font-heading text-[26px] font-extrabold text-ink-900">{value}</p>
    </div>
  )
}

function LiveCard({ session }: { session: LiveSession }) {
  const seconds = useElapsedSeconds(session.clockInAt)
  return (
    <div className="rounded-lg border border-brand-1/25 bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft font-heading text-[14px] font-extrabold text-brand-1">
          {session.user.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-extrabold text-ink-900">{session.user.name}</p>
          <p className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-500">
            <Timer className="h-3 w-3" /> mulai {formatWIB(session.clockInAt, 'HH.mm')}
          </p>
        </div>
        <span className="ml-auto font-mono text-[15px] font-extrabold text-brand-1 tabular-nums">
          {formatTimer(seconds)}
        </span>
      </div>
      <div className="mt-3 border-t border-line-soft pt-3">
        <p className="truncate text-[13.5px] font-bold text-ink-900">{session.task.title}</p>
        <p className="mt-0.5 truncate text-[12px] text-ink-500">
          {session.task.project} · {session.task.workType}
        </p>
      </div>
    </div>
  )
}

function WorkChart({ chart }: { chart: ChartResponse }) {
  // Ubah menit → jam (1 desimal) untuk tiap hari, per seri user
  const data = chart.days.map((day, i) => {
    const row: Record<string, string | number> = { day }
    for (const s of chart.series) {
      row[s.name] = Math.round((s.totals[i] / 60) * 10) / 10
    }
    return row
  })

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0EFF4" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(v: string) => formatDateShortWIB(`${v}T00:00:00Z`)}
            tick={{ fontSize: 11, fill: '#9291A0' }}
            tickLine={false}
            axisLine={{ stroke: '#E9E8EE' }}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#9291A0' }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            labelFormatter={(v: string) => formatDateShortWIB(`${v}T00:00:00Z`)}
            formatter={(value: number | string, name: string) => [`${value}j`, name]}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #E9E8EE',
              fontSize: 12,
              boxShadow: '0 6px 20px -8px rgba(20,18,32,0.10)',
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          {chart.series.map((s, i) => (
            <Bar
              key={s.userId}
              dataKey={s.name}
              stackId="hours"
              fill={SERIES_COLORS[i % SERIES_COLORS.length]}
              radius={i === chart.series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
