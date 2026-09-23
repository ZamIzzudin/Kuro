'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, CalendarDays } from 'lucide-react'
import type { TaskStatus } from '@prisma/client'
import { ErrorNote, Select, Spinner } from '@/components/ui'
import { OverdueBadge, PriorityBadge, STATUS_META, TaskProgress } from '@/components/task-bits'
import { apiSend, fetcher } from '@/lib/client'
import { formatDateShortWIB } from '@/lib/time'
import type { TaskItem } from '@/lib/tasks'

type MasterOption = { id: string; name: string; isActive: boolean }

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'review', 'done']

export function BucketClient() {
  const me = useSWR<{ user: { id: string } | null }>('/api/auth/me', fetcher)
  const tasksReq = useSWR<{ tasks: TaskItem[] }>('/api/tasks', fetcher)
  const projectsReq = useSWR<{ items: MasterOption[] }>('/api/projects', fetcher)

  const [fStatus, setFStatus] = useState('all')
  const [fProject, setFProject] = useState('all')
  const [fPriority, setFPriority] = useState('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const myId = me.data?.user?.id
  const tasks = useMemo(() => tasksReq.data?.tasks ?? [], [tasksReq.data])
  const projects = projectsReq.data?.items ?? []

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.status !== 'cancelled' &&
          (fStatus === 'all' || t.status === fStatus) &&
          (fProject === 'all' || t.projectId === fProject) &&
          (fPriority === 'all' || t.priority === fPriority)
      ),
    [tasks, fStatus, fProject, fPriority]
  )

  const columns = COLUMNS.filter((c) => fStatus === 'all' || fStatus === c)

  async function changeStatus(task: TaskItem, status: string) {
    setBusyId(task.id)
    setError(null)
    try {
      await apiSend(`/api/tasks/${task.id}/status`, 'PATCH', { status })
      await tasksReq.mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah status')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-5">
        <h1 className="font-heading text-[22px] font-extrabold">Task Bucket</h1>
        <p className="mt-1 text-sm text-ink-500">
          Task untuk Anda & bucket bersama — pilih task, lalu clock in di Beranda
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">Status</span>
          <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="all">Semua status</option>
            {COLUMNS.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-52">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">Project</span>
          <Select value={fProject} onChange={(e) => setFProject(e.target.value)}>
            <option value="all">Semua project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">Prioritas</span>
          <Select value={fPriority} onChange={(e) => setFPriority(e.target.value)}>
            <option value="all">Semua prioritas</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {tasksReq.isLoading ? (
        <div className="flex items-center justify-center py-24 text-ink-400">
          <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat task…</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-surface py-20 text-center shadow-sm">
          <p className="font-heading text-[16px] font-bold text-ink-900">Belum ada task untuk Anda</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
            Task akan muncul setelah admin membuat & meng-assign-nya. Task tanpa assignee tampil sebagai
            bucket bersama.
          </p>
        </div>
      ) : (
        <div
          className={`mt-6 grid gap-4 ${
            columns.length === 1 ? 'grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-4'
          }`}
        >
          {columns.map((col) => {
            const items = filtered.filter((t) => t.status === col)
            return (
              <section key={col} className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STATUS_META[col].dot}`} />
                    <h2 className="font-heading text-[13.5px] font-extrabold uppercase tracking-wide text-ink-700">
                      {STATUS_META[col].label}
                    </h2>
                  </div>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-bold text-ink-500 ring-1 ring-line">
                    {items.length}
                  </span>
                </div>

                {items.length === 0 ? (
                  <div className="rounded-md border border-dashed border-line bg-surface-2/60 px-4 py-6 text-center text-[12.5px] font-semibold text-ink-400">
                    Tidak ada task
                  </div>
                ) : (
                  items.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      owned={task.assigneeId === myId}
                      busy={busyId === task.id}
                      onStatus={changeStatus}
                    />
                  ))
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TaskCard({
  task,
  owned,
  busy,
  onStatus,
}: {
  task: TaskItem
  owned: boolean
  busy: boolean
  onStatus: (task: TaskItem, status: string) => void
}) {
  return (
    <article className="rounded-md border border-line bg-surface p-4 shadow-soft transition hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-[11px] font-extrabold uppercase tracking-wide text-brand-1">
          {task.project.name}
        </span>
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-bold text-ink-500 ring-1 ring-line">
          {task.workType.name}
        </span>
      </div>

      <h3 className="mt-2 line-clamp-2 text-[14px] font-bold leading-snug text-ink-900">{task.title}</h3>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={task.priority} />
        {task.deadlineAt && (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-500">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDateShortWIB(task.deadlineAt)}
          </span>
        )}
        {task.overdue && <OverdueBadge />}
      </div>

      <div className="mt-3">
        <TaskProgress loggedMinutes={task.loggedMinutes} estimatedHours={task.estimatedHours} />
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-line-soft pt-3">
        {owned ? (
          <select
            value={task.status}
            disabled={busy || task.status === 'done'}
            onChange={(e) => onStatus(task, e.target.value)}
            aria-label={`Ubah status ${task.title}`}
            className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-bold text-ink-700 outline-none transition focus:border-brand-1 disabled:opacity-60"
          >
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
          </select>
        ) : (
          <span className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-brand-1">
            Bucket Bersama
          </span>
        )}
        <Link
          href="/home"
          className="inline-flex items-center gap-1 text-[12.5px] font-bold text-brand-1 hover:underline"
        >
          Lanjutkan <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  )
}
