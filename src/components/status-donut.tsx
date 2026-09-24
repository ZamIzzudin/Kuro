'use client'

// Donut ringkasan status task — dipakai pada card project admin.
// Menampilkan jumlah tiap status + total di tengah, menggantikan progress bar.
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { TaskStatus } from '@prisma/client'
import { STATUS_META } from '@/components/task-bits'
import { cn } from '@/lib/utils'

/** Warna hex status (samakan dengan token `status` di tailwind.config.ts) */
const STATUS_HEX: Record<TaskStatus, string> = {
  todo: '#9291A0',
  in_progress: '#2F6FED',
  review: '#F0932B',
  done: '#1FB673',
  cancelled: '#EF4444',
}

const ACTIVE_ORDER: TaskStatus[] = ['todo', 'in_progress', 'review', 'done']

export function TaskStatusDonut({
  counts,
  statuses = ACTIVE_ORDER,
  centerLabel = 'Task',
  className,
}: {
  counts: Record<TaskStatus, number>
  statuses?: TaskStatus[]
  centerLabel?: string
  className?: string
}) {
  const data = statuses.map((s) => ({
    status: s,
    label: STATUS_META[s].label,
    value: counts[s] ?? 0,
    color: STATUS_HEX[s],
  }))
  const total = data.reduce((sum, d) => sum + d.value, 0)
  // Recharts tidak menggambar apa pun bila semua nilai 0 → pakai cincin abu-abu.
  const chartData =
    total > 0 ? data : [{ status: '_empty', label: '', value: 1, color: '#F0EFF4' }]

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="relative h-[112px] w-[112px] shrink-0">
        {/* Angka total di tengah — dirender SEBELUM chart agar tooltip tidak tertimpa */}
        <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center">
          <span className="font-heading text-[24px] font-extrabold leading-none text-ink-900">
            {total}
          </span>
          <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">
            {centerLabel}
          </span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="label"
              innerRadius="66%"
              outerRadius="100%"
              paddingAngle={total > 0 ? 2 : 0}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            {total > 0 && (
              <Tooltip
                formatter={(value: number | string, name: string) => [`${value} task`, name]}
                wrapperStyle={{ zIndex: 20 }}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #E9E8EE',
                  fontSize: 12,
                  boxShadow: '0 6px 20px -8px rgba(20,18,32,0.10)',
                }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d) => (
          <li key={d.status} className="flex items-center gap-2 text-[12.5px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="truncate font-medium text-ink-500">{d.label}</span>
            <span className="ml-auto font-extrabold tabular-nums text-ink-900">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
