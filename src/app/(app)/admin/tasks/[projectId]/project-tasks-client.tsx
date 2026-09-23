'use client'

import { useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowLeft, Ban, Pencil, Plus } from 'lucide-react'
import type { Priority, TaskStatus } from '@prisma/client'
import { Button, ErrorNote, FieldLabel, Input, Select, Spinner, Textarea } from '@/components/ui'
import { Sheet } from '@/components/sheet'
import { OverdueBadge, PriorityBadge, STATUS_META, StatusPill, TaskProgress } from '@/components/task-bits'
import { apiSend, fetcher } from '@/lib/client'
import { dateToWibLocal, formatDateWIB, todayWibDate } from '@/lib/time'
import type { TaskItem } from '@/lib/tasks'

type MasterOption = { id: string; name: string; isActive: boolean }
type UserRow = { id: string; name: string; role: 'admin' | 'freelancer'; isActive: boolean }

export function AdminProjectTasksClient({ projectId }: { projectId: string }) {
  const tasksReq = useSWR<{ tasks: TaskItem[] }>(`/api/tasks?projectId=${projectId}`, fetcher)
  const usersReq = useSWR<{ users: UserRow[] }>('/api/users', fetcher)
  const workTypesReq = useSWR<{ items: MasterOption[] }>('/api/work-types', fetcher)
  const requestersReq = useSWR<{ items: MasterOption[] }>('/api/requesters', fetcher)

  const [q, setQ] = useState('')
  const [fStatus, setFStatus] = useState('all')
  const [fAssignee, setFAssignee] = useState('all')
  const [fRequester, setFRequester] = useState('all')
  const [formTarget, setFormTarget] = useState<TaskItem | 'create' | null>(null)
  const [cancelFor, setCancelFor] = useState<TaskItem | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  const tasks = useMemo(() => tasksReq.data?.tasks ?? [], [tasksReq.data])
  const freelancers = (usersReq.data?.users ?? []).filter((u) => u.role === 'freelancer')
  const workTypes = workTypesReq.data?.items ?? []
  const requesters = requestersReq.data?.items ?? []
  const projectName = tasks[0]?.project.name

  const rows = tasks.filter(
    (t) =>
      (q.trim() === '' || t.title.toLowerCase().includes(q.trim().toLowerCase())) &&
      (fStatus === 'all' || t.status === fStatus) &&
      (fRequester === 'all' || t.requesterId === fRequester) &&
      (fAssignee === 'all' ||
        (fAssignee === 'unassigned' ? t.assigneeId === null : t.assigneeId === fAssignee))
  )

  const loadError = tasksReq.error || usersReq.error || workTypesReq.error || requestersReq.error
  const canCreate = !workTypesReq.isLoading && workTypes.length > 0 && requesters.length > 0

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link
        href="/admin/tasks"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-500 hover:text-brand-1"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Semua project
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-extrabold">
            {projectName ?? 'Memuat project…'}
          </h1>
          <p className="mt-1 text-sm text-ink-500">{tasks.length} task di project ini</p>
        </div>
        <Button onClick={() => setFormTarget('create')} disabled={!canCreate}>
          <Plus className="h-4 w-4" strokeWidth={2.4} /> Buat Task
        </Button>
      </div>

      {loadError && (
        <div className="mb-4">
          <ErrorNote>
            {loadError instanceof Error ? loadError.message : 'Gagal memuat data'}
          </ErrorNote>
        </div>
      )}

      {!workTypesReq.isLoading && workTypes.length === 0 && (
        <div className="mb-4">
          <ErrorNote>
            Belum ada jenis pekerjaan aktif. Tambahkan dulu di{' '}
            <Link href="/admin/masters" className="underline">
              Master → Jenis Pekerjaan
            </Link>
            .
          </ErrorNote>
        </div>
      )}

      {!requestersReq.isLoading && requesters.length === 0 && (
        <div className="mb-4">
          <ErrorNote>
            Belum ada requester aktif. Tambahkan dulu di{' '}
            <Link href="/admin/masters" className="underline">
              Master → Requester
            </Link>
            .
          </ErrorNote>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">Cari judul</span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari task…" />
        </div>
        <div className="w-44">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">Status</span>
          <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="all">Semua status</option>
            {(['todo', 'in_progress', 'review', 'done', 'cancelled'] as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">Requester</span>
          <Select value={fRequester} onChange={(e) => setFRequester(e.target.value)}>
            <option value="all">Semua requester</option>
            {requesters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.isActive ? '' : ' (nonaktif)'}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">Assignee</span>
          <Select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)}>
            <option value="all">Semua assignee</option>
            <option value="unassigned">Belum di-assign</option>
            {freelancers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.isActive ? '' : ' (nonaktif)'}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {rowError && (
        <div className="mb-4">
          <ErrorNote>{rowError}</ErrorNote>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
        {tasksReq.isLoading ? (
          <div className="flex items-center justify-center py-16 text-ink-400">
            <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat task…</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-bold text-ink-700">Tidak ada task</p>
            <p className="mt-1 text-sm text-ink-500">
              {tasks.length === 0
                ? 'Klik “Buat Task” untuk menambah task pertama di project ini.'
                : 'Coba ubah filter pencarian.'}
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="bg-surface-2/60 text-left text-[11px] font-bold uppercase tracking-wider text-ink-400">
                <th className="px-5 py-3">Task</th>
                <th className="px-5 py-3">Requester</th>
                <th className="px-5 py-3">Assignee</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Prioritas</th>
                <th className="px-5 py-3">Tenggat</th>
                <th className="px-5 py-3 w-52">Jam</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-line align-top transition hover:bg-surface-2/50">
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-ink-900">{t.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-500">{t.workType.name}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-ink-700">{t.requester.name}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    {t.assignee ? (
                      <span className="text-ink-700">
                        {t.assignee.name}
                        {freelancers.find((u) => u.id === t.assigneeId && !u.isActive) && (
                          <span className="ml-1 text-[11.5px] text-ink-400">(nonaktif)</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[12.5px] font-semibold text-ink-400">Belum di-assign</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusPill status={t.status} />
                  </td>
                  <td className="px-5 py-3.5">
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex flex-wrap items-center gap-1.5 text-[13px] text-ink-700">
                      {formatDateWIB(t.deadlineAt)}
                      {t.overdue && <OverdueBadge />}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <TaskProgress loggedMinutes={t.loggedMinutes} estimatedHours={t.estimatedHours} />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setFormTarget(t)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      {t.status !== 'cancelled' && t.status !== 'done' && (
                        <Button variant="ghost" size="sm" onClick={() => setCancelFor(t)}>
                          <Ban className="h-3.5 w-3.5 text-pri-high" /> Batalkan
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {formTarget && (
        <TaskFormSheet
          key={formTarget === 'create' ? 'create' : formTarget.id}
          initial={formTarget === 'create' ? null : formTarget}
          projectId={projectId}
          projectName={projectName ?? ''}
          freelancers={freelancers}
          workTypes={workTypes.filter((w) => w.isActive)}
          requesters={requesters.filter((r) => r.isActive)}
          onClose={() => setFormTarget(null)}
          onDone={() => tasksReq.mutate()}
        />
      )}

      <CancelSheet
        task={cancelFor}
        onClose={() => setCancelFor(null)}
        onDone={() => tasksReq.mutate()}
        onError={setRowError}
      />
    </div>
  )
}

function TaskFormSheet({
  initial,
  projectId,
  projectName,
  freelancers,
  workTypes,
  requesters,
  onClose,
  onDone,
}: {
  initial: TaskItem | null
  projectId: string
  projectName: string
  freelancers: UserRow[]
  workTypes: MasterOption[]
  requesters: MasterOption[]
  onClose: () => void
  onDone: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [workTypeId, setWorkTypeId] = useState(initial?.workTypeId ?? workTypes[0]?.id ?? '')
  const [requesterId, setRequesterId] = useState(initial?.requesterId ?? requesters[0]?.id ?? '')
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ?? '')
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'medium')
  const [estimatedHours, setEstimatedHours] = useState(
    initial?.estimatedHours != null ? String(initial.estimatedHours) : ''
  )
  const [requestDateLocal, setRequestDateLocal] = useState(initial?.requestDate ?? todayWibDate())
  const [deadlineLocal, setDeadlineLocal] = useState(
    initial ? dateToWibLocal(initial.deadlineAt) : ''
  )
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? 'todo')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isEdit = !!initial

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      projectId,
      workTypeId,
      requesterId,
      assigneeId: assigneeId || null,
      priority,
      estimatedHours: estimatedHours.trim() === '' ? null : Number(estimatedHours),
      requestDateLocal,
      deadlineLocal,
      ...(isEdit ? { status } : {}),
    }
    try {
      if (isEdit && initial) {
        await apiSend(`/api/tasks/${initial.id}`, 'PATCH', payload)
      } else {
        await apiSend('/api/tasks', 'POST', payload)
      }
      onDone()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit Task' : 'Buat Task'}
      description={isEdit ? projectName : `Project: ${projectName}`}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="t-title">Judul</FieldLabel>
          <Input
            id="t-title"
            required
            minLength={3}
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="cth: Desain landing page"
          />
        </div>

        <div>
          <FieldLabel htmlFor="t-desc">Deskripsi (opsional)</FieldLabel>
          <Textarea
            id="t-desc"
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detail brief, link referensi, dll."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="t-worktype">Jenis Pekerjaan</FieldLabel>
            <Select id="t-worktype" required value={workTypeId} onChange={(e) => setWorkTypeId(e.target.value)}>
              {workTypes.length === 0 && <option value="">— Belum ada jenis pekerjaan —</option>}
              {workTypes.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="t-requester">Requester</FieldLabel>
            <Select
              id="t-requester"
              required
              value={requesterId}
              onChange={(e) => setRequesterId(e.target.value)}
            >
              {requesters.length === 0 && <option value="">— Belum ada requester —</option>}
              {requesters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="t-assignee">Assignee</FieldLabel>
            <Select id="t-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Belum di-assign (bucket bersama)</option>
              {freelancers
                .filter((u) => u.isActive)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="t-priority">Prioritas</FieldLabel>
            <Select id="t-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="t-est">Estimasi (jam, opsional)</FieldLabel>
            <Input
              id="t-est"
              type="number"
              min={0.5}
              max={500}
              step={0.5}
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
              placeholder="cth: 4"
            />
          </div>
          <div>
            <FieldLabel htmlFor="t-reqdate">Tanggal Permintaan (WIB)</FieldLabel>
            <Input
              id="t-reqdate"
              type="date"
              required
              value={requestDateLocal}
              onChange={(e) => setRequestDateLocal(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="t-deadline">Tenggat (WIB)</FieldLabel>
            <Input
              id="t-deadline"
              type="datetime-local"
              required
              value={deadlineLocal}
              onChange={(e) => setDeadlineLocal(e.target.value)}
            />
          </div>
          {isEdit && (
            <div>
              <FieldLabel htmlFor="t-status">Status</FieldLabel>
              <Select id="t-status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                {(['todo', 'in_progress', 'review', 'done', 'cancelled'] as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Simpan Perubahan' : 'Simpan'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function CancelSheet({
  task,
  onClose,
  onDone,
  onError,
}: {
  task: TaskItem | null
  onClose: () => void
  onDone: () => void
  onError: (msg: string | null) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!task) return
    setSaving(true)
    setError(null)
    try {
      await apiSend(`/api/tasks/${task.id}`, 'PATCH', { status: 'cancelled' })
      onDone()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membatalkan task'
      setError(msg)
      onError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={!!task} onClose={onClose} title="Batalkan Task">
      <div className="space-y-4">
        <p className="text-sm text-ink-700">
          Yakin membatalkan <span className="font-bold">“{task?.title}”</span>? Status akan menjadi{' '}
          <span className="font-bold">Dibatalkan</span> dan tidak bisa dipilih untuk clock in.
        </p>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Kembali
          </Button>
          <Button variant="danger" loading={saving} onClick={confirm}>
            Ya, Batalkan
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
