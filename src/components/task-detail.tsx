'use client'

// Sheet detail TASK — level "cerita": metadata bisnis, brief/lampiran, daftar assignee,
// dan daftar subtask (unit kerja). Dipakai dari daftar task admin.
import { useState } from 'react'
import useSWR from 'swr'
import { CalendarDays, Clock, FileText, FolderKanban, History, Layers, RotateCcw, User, UserCheck } from 'lucide-react'
import type { TaskStatus } from '@prisma/client'
import { Sheet } from '@/components/sheet'
import { Button, ErrorNote, Select, Spinner } from '@/components/ui'
import { AttachmentList, formatBytes } from '@/components/attachment'
import { OverdueBadge, PriorityBadge, STATUS_META, StatusPill, TaskProgress } from '@/components/task-bits'
import { Markdown } from '@/components/markdown'
import { apiSend, fetcher } from '@/lib/client'
import { formatMinutes, formatWIB } from '@/lib/time'
import type { TaskItem } from '@/lib/tasks'

export function TaskDetailSheet({
  taskId,
  fallback,
  onClose,
}: {
  taskId: string
  /** Data yang sudah dimiliki pemanggil (opsional) — dipakai sebagai tampilan awal. */
  fallback?: TaskItem | null
  onClose: () => void
}) {
  const { data, isLoading, error, mutate } = useSWR<{ task: TaskItem }>(`/api/tasks/${taskId}`, fetcher)
  const task = data?.task ?? fallback ?? null

  const [busySubtaskId, setBusySubtaskId] = useState<string | null>(null)
  const [subtaskError, setSubtaskError] = useState<string | null>(null)
  const [revisionMode, setRevisionMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [revisionNote, setRevisionNote] = useState('')
  const [savingRevision, setSavingRevision] = useState(false)

  // Admin/PM mengubah status subtask; status task induk otomatis ikut (rollup di API).
  async function changeSubtaskStatus(subtaskId: string, status: TaskStatus) {
    setBusySubtaskId(subtaskId)
    setSubtaskError(null)
    try {
      await apiSend(`/api/subtasks/${subtaskId}`, 'PATCH', { status })
      await mutate()
    } catch (e) {
      setSubtaskError(e instanceof Error ? e.message : 'Gagal mengubah status subtask')
    } finally {
      setBusySubtaskId(null)
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function submitRevision() {
    if (!task || selected.length === 0) return
    setSavingRevision(true)
    setSubtaskError(null)
    try {
      await apiSend(`/api/tasks/${task.id}/revisions`, 'POST', {
        subtaskIds: selected,
        note: revisionNote.trim() || null,
      })
      setRevisionMode(false)
      setSelected([])
      setRevisionNote('')
      await mutate()
    } catch (e) {
      setSubtaskError(e instanceof Error ? e.message : 'Gagal meminta revisi')
    } finally {
      setSavingRevision(false)
    }
  }

  return (
    <Sheet open onClose={onClose} size="lg" title={task?.title ?? 'Detail Task'}>
      {error ? (
        <ErrorNote>{error instanceof Error ? error.message : 'Gagal memuat detail task'}</ErrorNote>
      ) : !task && isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat detail…</span>
        </div>
      ) : !task ? (
        <ErrorNote>Task tidak ditemukan.</ErrorNote>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.overdue && <OverdueBadge />}
            {task.sprint ? (
              <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-brand-1">
                {task.sprint.name}
              </span>
            ) : (
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-500 ring-1 ring-line">
                Backlog
              </span>
            )}
            {task.beyondSprint && (
              <span className="rounded-full bg-pri-mediumbg px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-status-review">
                Deadline lewat sprint
              </span>
            )}
          </div>

          <dl className="grid grid-cols-1 gap-x-5 gap-y-3.5 rounded-lg border border-line bg-surface-2/50 p-4 sm:grid-cols-2">
            <InfoRow icon={<FolderKanban className="h-3.5 w-3.5" />} label="Project">
              {task.project.name}
            </InfoRow>
            <InfoRow icon={<FileText className="h-3.5 w-3.5" />} label="Jenis Pekerjaan">
              {task.workType.name}
            </InfoRow>
            <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Requester">
              {task.requester.name}
            </InfoRow>
            <InfoRow icon={<UserCheck className="h-3.5 w-3.5" />} label="Assignee">
              {task.assignees.length === 0 ? 'Belum di-assign' : task.assignees.map((a) => a.name).join(', ')}
            </InfoRow>
            <InfoRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Tenggat">
              {formatWIB(task.deadlineAt, 'dd MMM yyyy, HH.mm')}
            </InfoRow>
            <InfoRow icon={<Clock className="h-3.5 w-3.5" />} label="Tanggal Permintaan">
              {task.requestDate}
            </InfoRow>
          </dl>

          <div>
            <h4 className="mb-2 text-[12.5px] font-bold uppercase tracking-wide text-ink-500">Progres Waktu</h4>
            <TaskProgress loggedMinutes={task.loggedMinutes} estimatedHours={task.estimatedHours} />
            <p className="mt-1.5 text-[12px] text-ink-400">
              Total tercatat: {formatMinutes(task.loggedMinutes)}
              {task.estimatedHours === null ? '' : ` dari estimasi ${task.estimatedHours} jam`}
            </p>
          </div>

          {task.revisionNote && (
            <div className="rounded-lg border border-brand-1/20 bg-brand-soft/40 p-4">
              <h4 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-wide text-brand-1">
                <History className="h-3.5 w-3.5" /> Catatan Revisi
              </h4>
              <p className="whitespace-pre-wrap text-[13px] text-ink-700">{task.revisionNote}</p>
            </div>
          )}

          {task.description && (
            <div>
              <h4 className="mb-2 text-[12.5px] font-bold uppercase tracking-wide text-ink-500">Deskripsi</h4>
              <div className="rounded-lg bg-surface-2/60 px-4 py-3">
                <Markdown>{task.description}</Markdown>
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-wide text-ink-500">
                <Layers className="h-3.5 w-3.5" /> Subtask
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-ink-500 ring-1 ring-line">
                  {task.subtaskProgress.done}/{task.subtaskProgress.total} selesai
                </span>
              </h4>
              {!revisionMode ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setRevisionMode(true)
                    setSelected([])
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Minta Revisi
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setRevisionMode(false)
                      setSelected([])
                    }}
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    loading={savingRevision}
                    disabled={selected.length === 0}
                    onClick={submitRevision}
                  >
                    Kembalikan {selected.length} subtask
                  </Button>
                </div>
              )}
            </div>

            {revisionMode && (
              <div className="mb-3 rounded-lg border border-brand-1/25 bg-brand-soft/40 p-3">
                <p className="text-[12.5px] font-semibold text-ink-700">
                  Pilih subtask yang perlu dikerjakan ulang. Subtask itu dikembalikan ke status{' '}
                  <span className="font-bold text-brand-1">Revisi</span> dan bisa diambil freelancer lagi.
                </p>
                <textarea
                  className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] text-ink-900 outline-none focus:border-brand-1"
                  rows={2}
                  maxLength={1000}
                  placeholder="Catatan revisi (opsional) — mis. warna tombol kurang kontras"
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                />
              </div>
            )}

            {subtaskError && (
              <div className="mb-2">
                <ErrorNote>{subtaskError}</ErrorNote>
              </div>
            )}
            <ul className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
              {task.subtasks.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  {revisionMode && (
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-[#8B2FF2]"
                      checked={selected.includes(s.id)}
                      onChange={() => toggleSelected(s.id)}
                      aria-label={`Pilih subtask ${s.title}`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-ink-900">{s.title}</p>
                    <p className="mt-0.5 truncate text-[12px] text-ink-500">
                      {s.assignee?.name ?? 'Belum di-assign'} · {formatMinutes(s.loggedMinutes)} tercatat
                    </p>
                  </div>
                  <Select
                    value={s.status}
                    disabled={busySubtaskId === s.id || revisionMode}
                    aria-label={`Status subtask ${s.title}`}
                    onChange={(e) => changeSubtaskStatus(s.id, e.target.value as TaskStatus)}
                    className="w-[140px] shrink-0 py-1.5 text-[12.5px]"
                  >
                    {(['todo', 'in_progress', 'review', 'revision', 'done'] as TaskStatus[]).map((st) => (
                      <option key={st} value={st}>
                        {STATUS_META[st].label}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-wide text-ink-500">
              Lampiran Brief
              {task.attachments.length > 0 && (
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-ink-500 ring-1 ring-line">
                  {task.attachments.length}
                </span>
              )}
            </h4>
            {task.attachments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[12.5px] font-semibold text-ink-400">
                Belum ada lampiran brief pada task ini.
              </p>
            ) : (
              <>
                {task.attachments.some((a) => a.isImage) && (
                  <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {task.attachments
                      .filter((a) => a.isImage)
                      .map((a) => (
                        <a
                          key={a.id}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          title={a.fileName}
                          className="group relative overflow-hidden rounded-md border border-line bg-surface-2"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.url} alt={a.fileName} className="h-28 w-full object-cover" />
                          <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[11px] font-semibold text-white">
                            {a.fileName}
                          </span>
                        </a>
                      ))}
                  </div>
                )}
                <AttachmentList items={task.attachments.filter((a) => !a.isImage)} />
                <p className="mt-2 text-[11.5px] text-ink-400">
                  Total {task.attachments.length} lampiran ·{' '}
                  {formatBytes(task.attachments.reduce((s, a) => s + a.size, 0))}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-1">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-[11.5px] font-bold uppercase tracking-wide text-ink-400">{label}</dt>
        <dd className="truncate text-[13.5px] font-semibold text-ink-900">{children}</dd>
      </div>
    </div>
  )
}
