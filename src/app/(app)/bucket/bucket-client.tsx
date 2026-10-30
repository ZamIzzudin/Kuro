"use client";

// Task Bucket freelancer — papan SUBTASK (unit kerja) dalam project terpilih.
// Hanya menampilkan subtask yang berada dalam jangkauan freelancer ini:
// subtask miliknya ATAU subtask tanpa assignee yang bisa ia ambil (bucket bersama).
// Subtask milik freelancer lain tidak pernah muncul di sini.
// Dua scope: Sprint Aktif (default, bisa dikerjakan) dan Backlog (read-only).
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, CalendarDays, FolderKanban } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { ErrorNote, Select, Spinner } from "@/components/ui";
import { OverdueBadge, PriorityBadge, STATUS_META } from "@/components/task-bits";
import { SubtaskDetailSheet } from "@/components/subtask-detail";
import { useProjectScope } from "@/components/project-scope";
import { apiSend, fetcher } from "@/lib/client";
import { cn } from "@/lib/utils";
import { formatDateShortWIB } from "@/lib/time";
import type { TaskItem, SubtaskItem } from "@/lib/tasks";
import type { ProjectItem } from "@/lib/projects";

const COLUMNS: TaskStatus[] = ["todo", "in_progress", "review", "revision", "done"];

type Scope = "active" | "backlog";

type AvailableSubtask = SubtaskItem & {
  task: Pick<
    TaskItem,
    | "id"
    | "title"
    | "priority"
    | "status"
    | "deadlineAt"
    | "overdue"
    | "workType"
    | "requester"
    | "project"
  >;
};

export function BucketClient() {
  const { projectId, projects, isLoading: scopeLoading, hasNone } = useProjectScope();
  const me = useSWR<{ user: { id: string } | null }>("/api/auth/me", fetcher);

  const [scope, setScope] = useState<Scope>("active");
  const subsReq = useSWR<{ subtasks: AvailableSubtask[] }>(
    projectId
      ? `/api/subtasks/available?projectId=${projectId}&scope=${scope}&includeDone=1`
      : null,
    fetcher,
  );

  const [fPriority, setFPriority] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  const myId = me.data?.user?.id;
  const project: ProjectItem | undefined = projects.find((p) => p.id === projectId);
  const subtasks = useMemo(() => subsReq.data?.subtasks ?? [], [subsReq.data]);

  // Hanya subtask milik saya atau belum berassignee (bisa diambil) yang bisa digeser,
  // dan hanya pada sprint aktif.
  const canDrag = (s: AvailableSubtask) =>
    scope === "active" && s.status !== "done" && (s.assigneeId === null || s.assigneeId === myId);

  const filtered = subtasks.filter(
    (s) => fPriority === "all" || s.task.priority === fPriority,
  );

  async function changeStatus(s: AvailableSubtask, status: string) {
    setBusyId(s.id);
    setError(null);
    try {
      await apiSend(`/api/subtasks/${s.id}/status`, "PATCH", { status });
      await subsReq.mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah status");
    } finally {
      setBusyId(null);
    }
  }

  function dropTo(col: TaskStatus) {
    setOverCol(null);
    const s = subtasks.find((x) => x.id === dragId);
    setDragId(null);
    if (!s || !canDrag(s) || s.status === col || busyId) return;
    changeStatus(s, col);
  }

  if (hasNone) {
    return (
      <div className="mx-auto max-w-[1400px]">
        <h1 className="font-heading text-[22px] font-extrabold">Task Bucket</h1>
        <div className="mt-5 rounded-xl border border-dashed border-line bg-surface px-5 py-4 shadow-soft">
          <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <FolderKanban className="h-4 w-4 text-brand-1" /> Belum di-assign ke project
          </p>
          <p className="mt-1 text-sm text-ink-500">
            Anda belum ditambahkan ke project mana pun. Hubungi admin agar bisa mengerjakan task.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-[22px] font-extrabold">{project?.name ?? "Task Bucket"}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {filtered.length} subtask · seret kartu untuk mengubah status (hanya sprint aktif)
          </p>
        </div>

        {/* Dua konsep filter: Sprint Aktif (default) & Backlog */}
        <div className="flex rounded-full bg-surface-2 p-1 ring-1 ring-line">
          {(["active", "backlog"] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn(
                "rounded-full px-4 py-1.5 text-[12.5px] font-bold transition",
                scope === s ? "bg-brand-1 text-white" : "text-ink-500 hover:text-ink-900",
              )}
            >
              {s === "active" ? "Sprint Aktif" : "Backlog"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">Prioritas task</span>
          <Select value={fPriority} onChange={(e) => setFPriority(e.target.value)}>
            <option value="all">Semua prioritas</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </div>
      </div>

      {scope === "backlog" && (
        <div className="mt-4 rounded-lg border border-line bg-surface-2/60 px-4 py-3 text-[12.5px] font-semibold text-ink-500">
          Task backlog belum masuk sprint aktif — belum bisa dikerjakan. Kartu hanya sebagai informasi.
        </div>
      )}

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {subsReq.error && (
        <div className="mt-4">
          <ErrorNote>{subsReq.error instanceof Error ? subsReq.error.message : "Gagal memuat subtask"}</ErrorNote>
        </div>
      )}

      {scopeLoading || !projectId || subsReq.isLoading ? (
        <div className="flex items-center justify-center py-24 text-ink-400">
          <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat subtask…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-surface py-20 text-center shadow-sm">
          <FolderKanban className="mx-auto h-8 w-8 text-ink-300" />
          <p className="mt-3 font-heading text-[16px] font-bold text-ink-900">
            {scope === "backlog" ? "Backlog kosong" : "Belum ada subtask untuk Anda di sprint aktif"}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
            {scope === "backlog"
              ? "Semua task sudah masuk sprint."
              : "Subtask akan muncul setelah admin memasukkannya ke sprint aktif dan menugaskannya ke Anda (atau membiarkannya bisa diambil)."}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = filtered.filter((s) => s.status === col);
            const isOver = overCol === col && dragId !== null;
            return (
              <section
                key={col}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  if (overCol !== col) setOverCol(col);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setOverCol((c) => (c === col ? null : c));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropTo(col);
                }}
                className={cn(
                  "flex flex-col gap-3 rounded-lg p-1.5 transition",
                  isOver && "bg-brand-soft ring-2 ring-brand-1/40",
                )}
              >
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
                  <div
                    className={cn(
                      "rounded-md border border-dashed border-line bg-surface-2/60 px-4 py-6 text-center text-[12.5px] font-semibold text-ink-400",
                      isOver && "border-brand-1/50 bg-surface-2 text-brand-1",
                    )}
                  >
                    {isOver ? "Lepaskan di sini" : "Tidak ada subtask"}
                  </div>
                ) : (
                  items.map((s) => (
                    <SubtaskCard
                      key={s.id}
                      subtask={s}
                      owned={s.assigneeId === myId}
                      busy={busyId === s.id}
                      draggable={canDrag(s)}
                      dragging={dragId === s.id}
                      onDragStart={() => setDragId(s.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverCol(null);
                      }}
                      onOpenDetail={() => setDetailId(s.id)}
                    />
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}

      {detailId && <SubtaskDetailSheet subtaskId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function SubtaskCard({
  subtask: st,
  owned,
  busy,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
  onOpenDetail,
}: {
  subtask: AvailableSubtask;
  owned: boolean;
  busy: boolean;
  draggable: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpenDetail: () => void;
}) {
  const task = st.task;
  return (
    <article
      draggable={draggable && !busy}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", st.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-md border border-line bg-surface p-4 shadow-soft transition",
        draggable && !busy ? "cursor-grab active:cursor-grabbing hover:shadow-md" : "hover:shadow-md",
        dragging && "opacity-40",
        busy && "animate-pulse",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-bold text-ink-500 ring-1 ring-line">
          {task.workType.name}
        </span>
        {st.assignee ? (
          <span className="truncate text-[11px] font-bold text-ink-500">{st.assignee.name}</span>
        ) : (
          <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-brand-1">
            Bisa diambil
          </span>
        )}
      </div>

      <button type="button" onClick={onOpenDetail} className="mt-2 block w-full text-left" title="Lihat detail subtask">
        <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-ink-900 hover:text-brand-1">
          {st.title}
        </h3>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-400">{task.title}</p>
      </button>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={task.priority} />
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-500">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatDateShortWIB(task.deadlineAt)}
        </span>
        {task.overdue && <OverdueBadge />}
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-line-soft pt-3">
        {owned && st.status === "done" && <span className="text-[12px] font-bold text-ink-400">Selesai</span>}
        <Link
          href="/home"
          className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-bold text-brand-1 hover:underline"
        >
          Kerjakan <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}
