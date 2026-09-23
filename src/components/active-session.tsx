'use client'

// Indikator "sesi berjalan" — selalu terlihat untuk freelancer (RANCANGAN §6)
import Link from 'next/link'
import useSWR from 'swr'
import { Timer } from 'lucide-react'
import { fetcher } from '@/lib/client'
import { useElapsedSeconds } from '@/hooks/use-elapsed'
import { formatTimer } from '@/lib/time'
import type { TimeEntryItem } from '@/lib/time-entries'

export function ActiveSessionIndicator({ compact = false }: { compact?: boolean }) {
  const { data } = useSWR<{ entry: TimeEntryItem | null }>('/api/time-entries/active', fetcher, {
    refreshInterval: 60_000,
  })
  const entry = data?.entry ?? null
  const seconds = useElapsedSeconds(entry?.clockInAt ?? null)

  if (!entry) return null

  if (compact) {
    return (
      <Link
        href="/home"
        title={`Berjalan: ${entry.task.title} — ${formatTimer(seconds)}`}
        className="mb-2 flex items-center justify-center rounded-sm bg-brand-soft p-2.5 text-brand-1"
      >
        <Timer className="h-4 w-4" />
      </Link>
    )
  }

  return (
    <Link
      href="/home"
      className="mt-2 block rounded-md border border-brand-1/25 bg-brand-soft/70 px-3 py-2.5 transition hover:bg-brand-soft"
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-1 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-1" />
        </span>
        <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-brand-1">
          Sesi berjalan
        </span>
        <span className="ml-auto font-mono text-[12px] font-extrabold text-brand-1 tabular-nums">
          {formatTimer(seconds)}
        </span>
      </div>
      <p className="mt-1 truncate text-[12.5px] font-bold text-ink-900">{entry.task.title}</p>
      <p className="truncate text-[11.5px] text-ink-500">{entry.task.project.name}</p>
    </Link>
  )
}
