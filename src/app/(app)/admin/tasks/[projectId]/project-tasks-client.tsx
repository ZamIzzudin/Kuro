"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Ban, Eye, LayoutGrid, Layers, List, Pencil, Plus, RotateCcw, Trash2, UserPlus } from "lucide-react";
import type { Priority, TaskStatus } from "@prisma/client";
import {
  Button,
  ErrorNote,
  FieldLabel,
  IconButton,
  Input,
  Select,
  Spinner,
  Textarea,
  Tooltip,
} from "@/components/ui";
import { Sheet } from "@/components/sheet";
import {
  AttachmentList,
  AttachmentPicker,
  toAttachmentPayload,
  type PendingAttachment,
} from "@/components/attachment";
import { TaskDetailSheet } from "@/components/task-detail";
import { MarkdownEditor } from "@/components/markdown-editor";
import { TaskKanban } from "./task-kanban";
import {
  OverdueBadge,
  PriorityBadge,
  RevisionBadge,
  RevisionCountBadge,
  STATUS_META,
  StatusPill,
} from "@/components/task-bits";
import { apiSend, fetcher } from "@/lib/client";
import type { Role } from "@/lib/roles";
import { dateToWibLocal, formatDateWIB, todayWibDate } from "@/lib/time";
import type { TaskItem } from "@/lib/tasks";
import type { SprintItem } from "@/lib/sprints";
import type { ProjectItem } from "@/lib/projects";

type MasterOption = { id: string; name: string; isActive: boolean };
type UserRow = {
  id: string;
  name: string;
  role: Role;
  isActive: boolean;
};

/** Baris subtask di dalam form (id ada = subtask lama). */
type SubtaskDraft = {
  id?: string;
  title: string;
  description: string;
  assigneeId: string;
  estimatedHours: string;
};

const emptySubtask = (): SubtaskDraft => ({
  title: "",
  description: "",
  assigneeId: "",
  estimatedHours: "",
});

export function AdminProjectTasksClient({ projectId }: { projectId: string }) {
  const tasksReq = useSWR<{ tasks: TaskItem[] }>(
    `/api/tasks?projectId=${projectId}`,
    fetcher,
  );
  const usersReq = useSWR<{ users: UserRow[] }>("/api/users", fetcher);
  const workTypesReq = useSWR<{ items: MasterOption[] }>(
    "/api/work-types",
    fetcher,
  );
  const requestersReq = useSWR<{ items: MasterOption[] }>(
    "/api/requesters",
    fetcher,
  );
  const sprintsReq = useSWR<{ sprints: SprintItem[] }>(
    `/api/sprints?projectId=${projectId}`,
    fetcher,
  );
  const projectReq = useSWR<{ project: ProjectItem }>(
    `/api/projects/${projectId}`,
    fetcher,
  );

  const [q, setQ] = useState("");
  const [view, setView] = useState<"table" | "board">("table");
  const [fStatus, setFStatus] = useState("all");
  const [fSprint, setFSprint] = useState("all");
  const [fAssignee, setFAssignee] = useState("all");
  const [fRequester, setFRequester] = useState("all");
  const [formTarget, setFormTarget] = useState<TaskItem | "create" | null>(
    null,
  );
  const [cancelFor, setCancelFor] = useState<TaskItem | null>(null);
  const [revisionFor, setRevisionFor] = useState<TaskItem | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const tasks = useMemo(() => tasksReq.data?.tasks ?? [], [tasksReq.data]);
  const sprints = useMemo(() => sprintsReq.data?.sprints ?? [], [sprintsReq.data]);
  const freelancers = (usersReq.data?.users ?? []).filter(
    (u) => u.role === "freelancer",
  );
  const workTypes = workTypesReq.data?.items ?? [];
  const project = projectReq.data?.project ?? null;
  const requesters = useMemo(() => {
    const all = requestersReq.data?.items ?? [];
    if (!project || project.requesters.length === 0) return all;
    const ids = new Set(project.requesters.map((r) => r.id));
    return all.filter((r) => ids.has(r.id));
  }, [requestersReq.data, project]);
  const allRequesters = requestersReq.data?.items ?? [];
  const projectName = project?.name ?? tasks[0]?.project.name;

  const rows = tasks.filter(
    (t) =>
      (q.trim() === "" ||
        t.title.toLowerCase().includes(q.trim().toLowerCase())) &&
      (fStatus === "all" || t.status === fStatus) &&
      (fSprint === "all" ||
        (fSprint === "backlog" ? t.sprintId === null : t.sprintId === fSprint)) &&
      (fRequester === "all" || t.requesterId === fRequester) &&
      (fAssignee === "all" ||
        (fAssignee === "unassigned"
          ? t.assignees.length === 0
          : t.assignees.some((a) => a.id === fAssignee))),
  );

  const loadError =
    tasksReq.error ||
    usersReq.error ||
    workTypesReq.error ||
    requestersReq.error ||
    projectReq.error ||
    sprintsReq.error;
  const canCreate =
    !workTypesReq.isLoading && workTypes.length > 0 && requesters.length > 0;

  // Ubah status task lewat drag & drop di papan kanban.
  async function changeTaskStatus(task: TaskItem, status: TaskStatus) {
    setBusyId(task.id);
    setRowError(null);
    try {
      await apiSend(`/api/tasks/${task.id}`, "PATCH", { status });
      await tasksReq.mutate();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Gagal mengubah status task");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link
        href="/admin/tasks"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-500 hover:text-brand-1"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Kembali
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {project && (
            <span
              className="h-12 w-12 shrink-0 overflow-hidden rounded-md ring-1 ring-line"
              style={
                project.bannerUrl
                  ? undefined
                  : { background: project.bannerColor || "#F4ECFF" }
              }
            >
              {project.bannerUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={project.bannerUrl}
                  alt=""
                  className="h-12 w-12 object-cover"
                />
              )}
            </span>
          )}
          <div>
            <h1 className="font-heading text-[22px] font-extrabold">
              {projectName ?? "Memuat project…"}
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              {tasks.length} task · {sprints.length} sprint
              {project && project.requesters.length > 0 && (
                <>
                  {" "}
                  · Requester:{" "}
                  {project.requesters.map((r) => r.name).join(", ")}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-surface-2 p-1 ring-1 ring-line">
            {([
              { key: "table", label: "Tabel", icon: List },
              { key: "board", label: "Kanban", icon: LayoutGrid },
            ] as const).map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition ${
                  view === v.key ? "bg-brand-1 text-white" : "text-ink-500 hover:text-ink-900"
                }`}
              >
                <v.icon className="h-3.5 w-3.5" /> {v.label}
              </button>
            ))}
          </div>
          <Link
            href={`/admin/sprints?projectId=${projectId}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-2 text-[12.5px] font-bold text-ink-700 transition hover:bg-surface-2"
          >
            <Layers className="h-4 w-4" /> Kelola Sprint
          </Link>
          <Button onClick={() => setFormTarget("create")} disabled={!canCreate}>
            <Plus className="h-4 w-4" strokeWidth={2.4} /> Buat Task
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4">
          <ErrorNote>
            {loadError instanceof Error
              ? loadError.message
              : "Gagal memuat data"}
          </ErrorNote>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">
            Cari judul / subtask
          </span>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari task…"
          />
        </div>
        <div className="w-44">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">
            Status
          </span>
          <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="all">Semua status</option>
            {(
              [
                "todo",
                "in_progress",
                "review",
                "done",
                "cancelled",
              ] as TaskStatus[]
            ).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">
            Sprint
          </span>
          <Select value={fSprint} onChange={(e) => setFSprint(e.target.value)}>
            <option value="all">Semua sprint</option>
            <option value="backlog">Backlog</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">
            Requester
          </span>
          <Select
            value={fRequester}
            onChange={(e) => setFRequester(e.target.value)}
          >
            <option value="all">Semua requester</option>
            {requesters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.isActive ? "" : " (nonaktif)"}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">
            Assignee
          </span>
          <Select
            value={fAssignee}
            onChange={(e) => setFAssignee(e.target.value)}
          >
            <option value="all">Semua assignee</option>
            <option value="unassigned">Belum di-assign</option>
            {freelancers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.isActive ? "" : " (nonaktif)"}
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

      {view === "board" ? (
        tasksReq.isLoading ? (
          <div className="flex items-center justify-center py-16 text-ink-400">
            <Spinner />{" "}
            <span className="ml-3 text-sm font-semibold">Memuat task…</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface py-16 text-center shadow-sm">
            <p className="text-sm font-bold text-ink-700">Tidak ada task</p>
            <p className="mt-1 text-sm text-ink-500">
              {tasks.length === 0
                ? "Klik “Buat Task” untuk menambah task pertama di project ini."
                : "Coba ubah filter pencarian."}
            </p>
          </div>
        ) : (
          <TaskKanban
            tasks={rows}
            busyId={busyId}
            onOpenDetail={setDetailId}
            onStatusChange={changeTaskStatus}
          />
        )
      ) : (
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
        {tasksReq.isLoading ? (
          <div className="flex items-center justify-center py-16 text-ink-400">
            <Spinner />{" "}
            <span className="ml-3 text-sm font-semibold">Memuat task…</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-bold text-ink-700">Tidak ada task</p>
            <p className="mt-1 text-sm text-ink-500">
              {tasks.length === 0
                ? "Klik “Buat Task” untuk menambah task pertama di project ini."
                : "Coba ubah filter pencarian."}
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="bg-surface-2/60 text-left text-[11px] font-bold uppercase tracking-wider text-ink-400">
                <th className="px-5 py-3">Task</th>
                <th className="px-5 py-3">Sprint</th>
                <th className="px-5 py-3">Subtask</th>
                <th className="px-5 py-3">Assignee</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Tenggat</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-line align-top transition hover:bg-surface-2/50"
                >
                  <td className="px-5 py-3.5">
                    <Tooltip label={t.title} side="top" wrap className="max-w-full">
                      <span className="block max-w-[240px] truncate font-bold text-ink-900">
                        {t.title}
                      </span>
                    </Tooltip>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-500">
                      <PriorityBadge priority={t.priority} />
                      <span>{t.workType.name}</span>
                    </div>
                    {(t.isRevision || t.revisions.length > 0) && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {t.isRevision && <RevisionBadge />}
                        <RevisionCountBadge count={t.revisions.length} />
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {t.sprint ? (
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand-1">
                        {t.sprint.name}
                      </span>
                    ) : (
                      <span className="text-[12.5px] font-semibold text-ink-400">
                        Backlog
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-700">
                      <Layers className="h-3.5 w-3.5 text-ink-400" />
                      {t.subtaskProgress.done}/{t.subtaskProgress.total} selesai
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {t.assignees.length === 0 ? (
                      <span className="text-[12.5px] font-semibold text-ink-400">
                        Belum di-assign
                      </span>
                    ) : (
                      <span className="text-ink-700">
                        {t.assignees.map((a) => a.name).join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusPill status={t.status} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex flex-wrap items-center gap-1.5 text-[13px] text-ink-700">
                      {formatDateWIB(t.deadlineAt)}
                      {t.overdue && <OverdueBadge />}
                      {t.beyondSprint && (
                        <span className="rounded-full bg-pri-mediumbg px-2 py-0.5 text-[10.5px] font-bold text-status-review">
                          lewat sprint
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        label="Detail"
                        icon={<Eye className="h-4 w-4" />}
                        onClick={() => setDetailId(t.id)}
                      />
                      <IconButton
                        label="Edit"
                        icon={<Pencil className="h-4 w-4" />}
                        onClick={() => setFormTarget(t)}
                      />
                      {(t.status === "done" || t.status === "review") && (
                        <IconButton
                          label="Buat Revisi"
                          icon={<RotateCcw className="h-4 w-4" />}
                          onClick={() => setRevisionFor(t)}
                        />
                      )}
                      {t.status !== "cancelled" && t.status !== "done" && (
                        <IconButton
                          label="Batalkan"
                          variant="danger"
                          icon={<Ban className="h-4 w-4" />}
                          onClick={() => setCancelFor(t)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}

      {formTarget && (
        <TaskFormSheet
          key={formTarget === "create" ? "create" : formTarget.id}
          initial={formTarget === "create" ? null : formTarget}
          projectId={projectId}
          projectName={projectName ?? ""}
          freelancers={freelancers}
          workTypes={workTypes.filter((w) => w.isActive)}
          requesters={requesterOptionsFor(
            formTarget === "create" ? null : formTarget,
            requesters,
            allRequesters,
          )}
          sprints={sprints}
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

      <RevisionSheet
        task={revisionFor}
        sprints={sprints}
        onClose={() => setRevisionFor(null)}
        onDone={() => tasksReq.mutate()}
        onError={setRowError}
      />

      {detailId && (
        <TaskDetailSheet
          taskId={detailId}
          fallback={tasks.find((t) => t.id === detailId) ?? null}
          onOpenTask={setDetailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

function requesterOptionsFor(
  task: TaskItem | null,
  projectRequesters: MasterOption[],
  allRequesters: MasterOption[],
): MasterOption[] {
  const active = projectRequesters.filter((r) => r.isActive);
  if (task && !active.some((r) => r.id === task.requesterId)) {
    const extra = allRequesters.find((r) => r.id === task.requesterId);
    if (extra) return [...active, extra];
  }
  return active;
}

function TaskFormSheet({
  initial,
  projectId,
  projectName,
  freelancers,
  workTypes,
  requesters,
  sprints,
  onClose,
  onDone,
}: {
  initial: TaskItem | null;
  projectId: string;
  projectName: string;
  freelancers: UserRow[];
  workTypes: MasterOption[];
  requesters: MasterOption[];
  sprints: SprintItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [workTypeId, setWorkTypeId] = useState(
    initial?.workTypeId ?? workTypes[0]?.id ?? "",
  );
  const [requesterId, setRequesterId] = useState(
    initial?.requesterId ?? requesters[0]?.id ?? "",
  );
  const [sprintId, setSprintId] = useState(initial?.sprintId ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    initial?.assignees.map((a) => a.id) ?? [],
  );
  const [priority, setPriority] = useState<Priority>(
    initial?.priority ?? "medium",
  );
  const [estimatedHours, setEstimatedHours] = useState(
    initial?.estimatedHours != null ? String(initial.estimatedHours) : "",
  );
  const [requestDateLocal, setRequestDateLocal] = useState(
    initial?.requestDate ?? todayWibDate(),
  );
  const [deadlineLocal, setDeadlineLocal] = useState(
    initial ? dateToWibLocal(initial.deadlineAt) : "",
  );
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? "todo");
  const [newFiles, setNewFiles] = useState<PendingAttachment[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>(
    initial
      ? initial.subtasks.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description ?? "",
          assigneeId: s.assigneeId ?? "",
          estimatedHours: s.estimatedHours != null ? String(s.estimatedHours) : "",
        }))
      : [emptySubtask()],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEdit = !!initial;
  const storedAttachments = (initial?.attachments ?? []).filter(
    (a) => !removedIds.includes(a.id),
  );
  const activeFreelancers = freelancers.filter((u) => u.isActive);

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function updateSubtask(i: number, patch: Partial<SubtaskDraft>) {
    setSubtasks((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanSubtasks = subtasks
      .filter((s) => s.title.trim() !== "")
      .map((s, idx) => ({
        ...(s.id ? { id: s.id } : {}),
        title: s.title.trim(),
        description: s.description.trim() || null,
        assigneeId: s.assigneeId || null,
        estimatedHours:
          s.estimatedHours.trim() === "" ? null : Number(s.estimatedHours),
        position: idx,
      }));
    if (cleanSubtasks.length === 0) {
      setError("Minimal satu subtask harus punya judul.");
      return;
    }

    setSaving(true);
    const attachments = toAttachmentPayload(newFiles);
    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      projectId,
      sprintId: sprintId || null,
      workTypeId,
      requesterId,
      assigneeIds,
      priority,
      estimatedHours:
        estimatedHours.trim() === "" ? null : Number(estimatedHours),
      requestDateLocal,
      deadlineLocal,
      subtasks: cleanSubtasks,
      ...(isEdit ? { status } : {}),
      ...(isEdit
        ? { addAttachments: attachments, removeAttachmentIds: removedIds }
        : { attachments }),
    };
    try {
      if (isEdit && initial) {
        await apiSend(`/api/tasks/${initial.id}`, "PATCH", payload);
      } else {
        await apiSend("/api/tasks", "POST", payload);
      }
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={isEdit ? "Edit Task" : "Buat Task"}
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
          <FieldLabel>Deskripsi (Markdown, opsional)</FieldLabel>
          <MarkdownEditor
            id="t-desc"
            value={description}
            onChange={setDescription}
            placeholder="Detail brief, link referensi, bullet list, dll."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="t-worktype">Jenis Pekerjaan</FieldLabel>
            <Select
              id="t-worktype"
              required
              value={workTypeId}
              onChange={(e) => setWorkTypeId(e.target.value)}
            >
              {workTypes.length === 0 && (
                <option value="">— Belum ada jenis pekerjaan —</option>
              )}
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
              {requesters.length === 0 && (
                <option value="">— Belum ada requester —</option>
              )}
              {requesters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="t-sprint">Sprint</FieldLabel>
            <Select
              id="t-sprint"
              value={sprintId}
              onChange={(e) => setSprintId(e.target.value)}
            >
              <option value="">Backlog (di luar sprint)</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.status}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="t-priority">Prioritas</FieldLabel>
            <Select
              id="t-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
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
            <FieldLabel htmlFor="t-reqdate">
              Tanggal Permintaan (WIB)
            </FieldLabel>
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
              <Select
                id="t-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                {(
                  [
                    "todo",
                    "in_progress",
                    "review",
                    "done",
                    "cancelled",
                  ] as TaskStatus[]
                ).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div>
          <FieldLabel>
            <span className="inline-flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> Assignee (boleh lebih dari
              satu)
            </span>
          </FieldLabel>
          <div className="flex flex-wrap gap-2 rounded-md border border-line bg-surface p-3">
            {activeFreelancers.length === 0 && (
              <span className="text-[12.5px] font-semibold text-ink-400">
                Belum ada freelancer aktif.
              </span>
            )}
            {activeFreelancers.map((u) => {
              const on = assigneeIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleAssignee(u.id)}
                  className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold transition ${
                    on
                      ? "bg-brand-1 text-white"
                      : "bg-surface-2 text-ink-500 ring-1 ring-line hover:text-ink-900"
                  }`}
                >
                  {u.name}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[12px] text-ink-400">
            Subask tanpa assignee bisa diambil siapa pun di project ini (bucket
            bersama).
          </p>
        </div>

        <div className="border-t border-line-soft pt-4">
          <div className="mb-2 flex items-center justify-between">
            <FieldLabel>
              <span className="inline-flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Subtask (unit kerja)
              </span>
            </FieldLabel>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSubtasks((p) => [...p, emptySubtask()])}
            >
              <Plus className="h-3.5 w-3.5" /> Tambah
            </Button>
          </div>
          <div className="space-y-3">
            {subtasks.map((s, i) => (
              <div
                key={s.id ?? `new-${i}`}
                className="rounded-md border border-line bg-surface-2/40 p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-[12px] font-bold text-ink-400">
                    #{i + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      value={s.title}
                      maxLength={150}
                      placeholder="Judul subtask"
                      onChange={(e) =>
                        updateSubtask(i, { title: e.target.value })
                      }
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Select
                        value={s.assigneeId}
                        onChange={(e) =>
                          updateSubtask(i, { assigneeId: e.target.value })
                        }
                      >
                        <option value="">Assignee: belum ditentukan</option>
                        {activeFreelancers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        min={0.5}
                        max={500}
                        step={0.5}
                        value={s.estimatedHours}
                        placeholder="Estimasi (jam)"
                        onChange={(e) =>
                          updateSubtask(i, { estimatedHours: e.target.value })
                        }
                      />
                    </div>
                    <MarkdownEditor
                      value={s.description}
                      onChange={(v) => updateSubtask(i, { description: v })}
                      placeholder="Detail teknis subtask (Markdown, opsional)"
                      rows={3}
                      label="Deskripsi subtask"
                    />
                  </div>
                  {subtasks.length > 1 && (
                    <IconButton
                      label="Hapus subtask"
                      variant="danger"
                      icon={<Trash2 className="h-4 w-4" />}
                      onClick={() =>
                        setSubtasks((p) => p.filter((_, idx) => idx !== i))
                      }
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-line-soft pt-4">
          <FieldLabel>Lampiran Brief</FieldLabel>
          {isEdit && storedAttachments.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-400">
                Tersimpan ({storedAttachments.length})
              </p>
              <AttachmentList
                items={storedAttachments}
                onRemove={(a) => setRemovedIds((prev) => [...prev, a.id])}
              />
            </div>
          )}
          <AttachmentPicker
            files={newFiles}
            onChange={setNewFiles}
            disabled={saving}
          />
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? "Simpan Perubahan" : "Simpan"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function CancelSheet({
  task,
  onClose,
  onDone,
  onError,
}: {
  task: TaskItem | null;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!task) return;
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/api/tasks/${task.id}`, "PATCH", { status: "cancelled" });
      onDone();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal membatalkan task";
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!task} onClose={onClose} title="Batalkan Task">
      <div className="space-y-4">
        <p className="text-sm text-ink-700">
          Yakin membatalkan <span className="font-bold">“{task?.title}”</span>?
          Semua subtask akan menjadi <span className="font-bold">Dibatalkan</span>{" "}
          dan tidak bisa dipilih untuk clock in.
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
  );
}

/**
 * Buat task REVISI dari task yang sudah done/review.
 * Task lama tetap Done; task baru berstatus To Do agar bisa diambil pada sprint
 * berikutnya. Detail disalin apa adanya — admin lalu mengubah yang perlu direvisi.
 */
function RevisionSheet({
  task,
  sprints,
  onClose,
  onDone,
  onError,
}: {
  task: TaskItem | null;
  sprints: SprintItem[];
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const [note, setNote] = useState("");
  const [sprintId, setSprintId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromReview = task?.status === "review";

  async function confirm() {
    if (!task) return;
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/api/tasks/${task.id}/revisions`, "POST", {
        note: note.trim() || null,
        sprintId: sprintId || null,
      });
      onDone();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal membuat revisi";
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!task} onClose={onClose} title="Buat Task Revisi">
      <div className="space-y-4">
        <div className="rounded-lg border border-brand-1/20 bg-brand-soft/40 px-4 py-3">
          <p className="text-[13px] font-bold text-ink-900">{task?.title}</p>
          <p className="mt-1 text-[12.5px] text-ink-500">
            Dibuat sebagai <span className="font-bold">task baru</span> berstatus{" "}
            <span className="font-bold">To Do</span> dengan detail yang disalin dari task ini.
            {fromReview && " Task ini akan dinaikkan menjadi Done."}
          </p>
        </div>

        <div>
          <FieldLabel htmlFor="rev-note">Catatan revisi (opsional)</FieldLabel>
          <Textarea
            id="rev-note"
            rows={4}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Apa yang perlu direvisi? (mis. warna tombol kurang kontras, copy berubah)"
          />
        </div>

        <div>
          <FieldLabel htmlFor="rev-sprint">Sprint task revisi</FieldLabel>
          <Select
            id="rev-sprint"
            value={sprintId}
            onChange={(e) => setSprintId(e.target.value)}
          >
            <option value="">Backlog (bisa diambil pada sprint berikutnya)</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.status}
              </option>
            ))}
          </Select>
        </div>

        {task && task.subtasks.length > 0 && (
          <p className="text-[12.5px] text-ink-500">
            {task.subtasks.length} subtask akan disalin dengan status To Do.
          </p>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" loading={saving} onClick={confirm}>
            Buat Revisi
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
