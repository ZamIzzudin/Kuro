// Komponen kecil untuk task — status pill, priority badge, overdue, progress bar
import type { Priority, TaskStatus } from '@prisma/client'
import { formatMinutes } from '@/lib/time'

export const STATUS_META: Record<TaskStatus, { label: string; chip: string; dot: string }> = {
  todo: { label: 'To Do', chip: 'bg-line-soft text-ink-500', dot: 'bg-status-backlog' },
  in_progress: { label: 'In Progress', chip: 'bg-[#E8EFFF] text-status-progress', dot: 'bg-status-progress' },
  review: { label: 'Review', chip: 'bg-pri-mediumbg text-status-review', dot: 'bg-status-review' },
  done: { label: 'Done', chip: 'bg-pri-lowbg text-status-completed', dot: 'bg-status-completed' },
  cancelled: { label: 'Dibatalkan', chip: 'bg-pri-highbg text-pri-high', dot: 'bg-pri-high' },
}

export function StatusPill({ status }: { status: TaskStatus }) {
  const m = STATUS_META[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide ${m.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

export const PRIORITY_META: Record<Priority, { label: string; chip: string; dot: string }> = {
  high: { label: 'High', chip: 'bg-pri-highbg text-pri-high', dot: 'bg-pri-high' },
  medium: { label: 'Medium', chip: 'bg-pri-mediumbg text-pri-medium', dot: 'bg-pri-medium' },
  low: { label: 'Low', chip: 'bg-pri-lowbg text-pri-low', dot: 'bg-pri-low' },
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const m = PRIORITY_META[priority]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide ${m.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

export function OverdueBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-pri-highbg px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-pri-high">
      Overdue
    </span>
  )
}

/** Progress tercatat vs estimasi (menit, rule #4: pembulatan ke bawah) */
export function TaskProgress({
  loggedMinutes,
  estimatedHours,
}: {
  loggedMinutes: number
  estimatedHours: number | null
}) {
  if (estimatedHours === null) {
    return (
      <div className="flex items-center justify-between text-[11.5px] font-semibold text-ink-500">
        <span className="tabular-nums text-ink-700">{formatMinutes(loggedMinutes)}</span>
        <span className="text-ink-400">Tanpa estimasi</span>
      </div>
    )
  }
  const estMinutes = estimatedHours * 60
  const pct = estMinutes > 0 ? Math.min(100, Math.round((loggedMinutes / estMinutes) * 100)) : 0
  const complete = estMinutes > 0 && loggedMinutes >= estMinutes
  return (
    <div>
      <div className="flex items-center justify-between text-[11.5px] font-semibold text-ink-500">
        <span className="tabular-nums text-ink-700">
          {formatMinutes(loggedMinutes)} / {estimatedHours}j
        </span>
        <span className={complete ? 'font-extrabold text-status-completed' : ''}>{pct}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-line-soft">
        <div
          className={`h-1.5 rounded-full ${complete ? 'bg-status-completed' : 'bg-brand-1'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
