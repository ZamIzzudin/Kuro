'use client'

// Sheet detail subtask — unit kerja terdalam (tempat clock in/out).
// Menampilkan info task induk, assignee, deskripsi (Markdown), lampiran, dan progres waktu.
import useSWR from 'swr'
import { CalendarDays, Clock, FileText, FolderKanban, Layers, User, UserCheck } from 'lucide-react'
import { Sheet } from '@/components/sheet'
import { ErrorNote, Spinner } from '@/components/ui'
import { AttachmentList, formatBytes } from '@/components/attachment'
import { OverdueBadge, PriorityBadge, StatusPill, TaskProgress } from '@/components/task-bits'
import { Markdown } from '@/components/markdown'
import { fetcher } from '@/lib/client'
import { formatMinutes, formatWIB } from '@/lib/time'
import type { SubtaskItem, TaskItem } from '@/lib/tasks'

type SubtaskDetail = SubtaskItem & {
  task?: Pick<
    TaskItem,
    'id' | 'title' | 'priority' | 'deadlineAt' | 'overdue' | 'status' | 'workType' | 'requester' | 'project'
  >
}

export function SubtaskDetailSheet({
  subtaskId,
  onClose,
}: {
  subtaskId: string
  onClose: () => void
}) {
  const { data, isLoading, error } = useSWR<{ subtask: SubtaskDetail }>(`/api/subtasks/${subtaskId}`, fetcher)
  const subtask = data?.subtask ?? null

  return (
    <Sheet open onClose={onClose} size="lg" title={subtask?.title ?? 'Detail Subtask'}>
      {error ? (
        <ErrorNote>{error instanceof Error ? error.message : 'Gagal memuat detail subtask'}</ErrorNote>
      ) : !subtask && isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-400">
          <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat detail…</span>
        </div>
      ) : !subtask ? (
        <ErrorNote>Subtask tidak ditemukan.</ErrorNote>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={subtask.status} />
            {subtask.task && <PriorityBadge priority={subtask.task.priority} />}
            {subtask.task?.overdue && <OverdueBadge />}
            {!subtask.assignee && (
              <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-brand-1">
                Bisa Diambil
              </span>
            )}
          </div>

          <dl className="grid grid-cols-1 gap-x-5 gap-y-3.5 rounded-lg border border-line bg-surface-2/50 p-4 sm:grid-cols-2">
            {subtask.task && (
              <>
                <InfoRow icon={<Layers className="h-3.5 w-3.5" />} label="Task Induk">
                  {subtask.task.title}
                </InfoRow>
                <InfoRow icon={<FolderKanban className="h-3.5 w-3.5" />} label="Project">
                  {subtask.task.project.name}
                </InfoRow>
                <InfoRow icon={<FileText className="h-3.5 w-3.5" />} label="Jenis Pekerjaan">
                  {subtask.task.workType.name}
                </InfoRow>
                <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Requester">
                  {subtask.task.requester.name}
                </InfoRow>
                <InfoRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Tenggat Task">
                  {formatWIB(subtask.task.deadlineAt, 'dd MMM yyyy, HH.mm')}
                </InfoRow>
              </>
            )}
            <InfoRow icon={<UserCheck className="h-3.5 w-3.5" />} label="Assignee">
              {subtask.assignee?.name ?? 'Belum di-assign'}
            </InfoRow>
            {subtask.estimatedHours !== null && (
              <InfoRow icon={<Clock className="h-3.5 w-3.5" />} label="Estimasi">
                {subtask.estimatedHours} jam
              </InfoRow>
            )}
          </dl>

          <div>
            <h4 className="mb-2 text-[12.5px] font-bold uppercase tracking-wide text-ink-500">Progres Waktu</h4>
            <TaskProgress loggedMinutes={subtask.loggedMinutes} estimatedHours={subtask.estimatedHours} />
            <p className="mt-1.5 text-[12px] text-ink-400">
              Total tercatat: {formatMinutes(subtask.loggedMinutes)}
              {subtask.estimatedHours === null ? '' : ` dari estimasi ${subtask.estimatedHours} jam`}
            </p>
          </div>

          {subtask.description && (
            <div>
              <h4 className="mb-2 text-[12.5px] font-bold uppercase tracking-wide text-ink-500">Deskripsi</h4>
              <div className="rounded-lg bg-surface-2/60 px-4 py-3">
                <Markdown>{subtask.description}</Markdown>
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-wide text-ink-500">
              Lampiran
              {subtask.attachments.length > 0 && (
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-ink-500 ring-1 ring-line">
                  {subtask.attachments.length}
                </span>
              )}
            </h4>
            {subtask.attachments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[12.5px] font-semibold text-ink-400">
                Belum ada lampiran pada subtask ini.
              </p>
            ) : (
              <>
                {subtask.attachments.some((a) => a.isImage) && (
                  <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {subtask.attachments
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
                <AttachmentList items={subtask.attachments.filter((a) => !a.isImage)} />
                <p className="mt-2 text-[11.5px] text-ink-400">
                  Total {subtask.attachments.length} lampiran ·{' '}
                  {formatBytes(subtask.attachments.reduce((s, a) => s + a.size, 0))}
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
