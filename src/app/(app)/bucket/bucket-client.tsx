'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { AlertTriangle, ChevronRight, FolderKanban, UserPlus } from 'lucide-react'
import type { TaskStatus } from '@prisma/client'
import { ErrorNote, Spinner } from '@/components/ui'
import { STATUS_META } from '@/components/task-bits'
import { fetcher } from '@/lib/client'
import type { ProjectOverview } from '@/lib/tasks'

type Filter = 'all' | 'active' | 'mine' | 'unassigned'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'active', label: 'Perlu dikerjakan' },
  { key: 'mine', label: 'Di-assign ke saya' },
  { key: 'unassigned', label: 'Bucket bersama' },
]

export function BucketClient() {
  const { data, isLoading, error } = useSWR<{ projects: ProjectOverview[] }>(
    '/api/projects/overview',
    fetcher
  )
  const [filter, setFilter] = useState<Filter>('all')

  const projects = useMemo(() => data?.projects ?? [], [data])
  const visible = projects.filter((p) => {
    if (filter === 'active') return p.active > 0
    if (filter === 'mine') return p.mine > 0
    if (filter === 'unassigned') return p.unassigned > 0
    return true
  })

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-5">
        <h1 className="font-heading text-[22px] font-extrabold">Task Bucket</h1>
        <p className="mt-1 text-sm text-ink-500">
          Pilih project untuk melihat & mengerjakan task di dalamnya
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error instanceof Error ? error.message : 'Gagal memuat project'}</ErrorNote>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-ink-400">
          <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat project…</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-surface py-20 text-center shadow-sm">
          <FolderKanban className="mx-auto h-8 w-8 text-ink-300" />
          <p className="mt-3 font-heading text-[16px] font-bold text-ink-900">
            {projects.length === 0 ? 'Belum ada project untuk Anda' : 'Tidak ada project pada filter ini'}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
            {projects.length === 0
              ? 'Project akan muncul setelah admin membuat task untuk Anda di dalamnya.'
              : 'Coba pilih filter lain.'}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project }: { project: ProjectOverview }) {
  return (
    <Link
      href={`/bucket/${project.id}`}
      className="group flex flex-col rounded-lg border border-line bg-surface p-5 shadow-soft transition hover:border-brand-1/30 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-heading text-[16px] font-extrabold text-ink-900">
            {project.name}
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-500">
            {project.total} task · {project.active} perlu dikerjakan
          </p>
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-300 transition group-hover:text-brand-1" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {project.overdue > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-pri-highbg px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-pri-high">
            <AlertTriangle className="h-3 w-3" /> {project.overdue} overdue
          </span>
        )}
        {project.mine > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-brand-1">
            {project.mine} task saya
          </span>
        )}
        {project.unassigned > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-500 ring-1 ring-line">
            <UserPlus className="h-3 w-3" /> {project.unassigned} bucket bersama
          </span>
        )}
        {project.overdue === 0 && project.mine === 0 && project.unassigned === 0 && (
          <span className="text-[12.5px] text-ink-400">Tidak ada task aktif</span>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11.5px] font-semibold text-ink-500">
          <span>Progress selesai</span>
          <span className="font-extrabold text-ink-700">{project.progressPct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-line-soft">
          <div
            className="h-1.5 rounded-full bg-brand-1"
            style={{ width: `${project.progressPct}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-line-soft pt-3.5">
        {(['todo', 'in_progress', 'review', 'done'] as TaskStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-500">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s].dot}`} />
            {STATUS_META[s].label}
            <span className="font-extrabold text-ink-700">{project.counts[s]}</span>
          </span>
        ))}
      </div>
    </Link>
  )
}
