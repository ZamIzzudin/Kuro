"use client";

// Task Bucket freelancer — langsung menampilkan papan task project yang dipilih.
// Perpindahan project HANYA lewat dropdown di sidebar (ProjectSwitcher),
// sehingga halaman ini tidak punya pemilih project sendiri.
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, CalendarDays, FolderKanban } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { ErrorNote, Select, Spinner } from "@/components/ui";
import {
  OverdueBadge,
  PriorityBadge,
  STATUS_META,
  TaskProgress,
} from "@/components/task-bits";
import { TaskDetailSheet } from "@/components/task-detail";
import { useProjectScope } from "@/components/project-scope";
import { apiSend, fetcher } from "@/lib/client";
import { cn } from "@/lib/utils";
import { formatDateShortWIB } from "@/lib/time";
import type { TaskItem } from "@/lib/tasks";
import type { ProjectItem } from "@/lib/projects";

const COLUMNS: TaskStatus[] = ["todo", "in_progress", "review", "done"];

export function BucketClient() {
  const {
    projectId,
    projects,
    isLoading: scopeLoading,
    hasNone,
  } = useProjectScope();
  const me = useSWR<{ user: { id: string } | null }>("/api/auth/me", fetcher);
  const tasksReq = useSWR<{ tasks: TaskItem[] }>(
    projectId ? `/api/tasks?projectId=${projectId}` : null,
    fetcher,
  );

  const [fStatus, setFStatus] = useState("all");
  const [fPriority, setFPriority] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  const myId = me.data?.user?.id;
  const project: ProjectItem | undefined = projects.find(
    (p) => p.id === projectId,
  );
  const tasks = useMemo(() => tasksReq.data?.tasks ?? [], [tasksReq.data]);

  // Hanya task milik sendiri & belum selesai yang boleh dipindah lewat drag
  const canDrag = (t: TaskItem) =>
    t.assigneeId === myId && t.status !== "done" && t.status !== "cancelled";

  const filtered = tasks.filter(
    (t) =>
      t.status !== "cancelled" &&
      (fStatus === "all" || t.status === fStatus) &&
      (fPriority === "all" || t.priority === fPriority),
  );
  const columns = COLUMNS.filter((c) => fStatus === "all" || fStatus === c);

  async function changeStatus(task: TaskItem, status: string) {
    setBusyId(task.id);
    setError(null);
    try {
      await apiSend(`/api/tasks/${task.id}/status`, "PATCH", { status });
      await tasksReq.mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah status");
    } finally {
      setBusyId(null);
    }
  }

  function dropTo(col: TaskStatus) {
    setOverCol(null);
    const task = tasks.find((t) => t.id === dragId);
    setDragId(null);
    if (!task || !canDrag(task) || task.status === col || busyId) return;
    changeStatus(task, col);
  }

  // Belum di-assign ke project mana pun → beri panduan, bukan papan kosong
  if (hasNone) {
    return (
      <div className="mx-auto max-w-[1400px]">
        <h1 className="font-heading text-[22px] font-extrabold">Task Bucket</h1>
        <div className="mt-5 rounded-xl border border-dashed border-line bg-surface px-5 py-4 shadow-soft">
          <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <FolderKanban className="h-4 w-4 text-brand-1" /> Belum di-assign ke
            project
          </p>
          <p className="mt-1 text-sm text-ink-500">
            Anda belum ditambahkan ke project mana pun. Hubungi admin agar bisa
            mengerjakan task.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-5">
        <h1 className="font-heading text-[22px] font-extrabold">
          {project?.name ?? "Task Bucket"}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {tasks.length} task · task tanpa assignee bisa diambil lewat clock in
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">
            Status
          </span>
          <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="all">Semua status</option>
            {COLUMNS.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">
            Prioritas
          </span>
          <Select
            value={fPriority}
            onChange={(e) => setFPriority(e.target.value)}
          >
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

      {tasksReq.error && (
        <div className="mt-4">
          <ErrorNote>
            {tasksReq.error instanceof Error
              ? tasksReq.error.message
              : "Gagal memuat task"}
          </ErrorNote>
        </div>
      )}

      {scopeLoading || !projectId || tasksReq.isLoading ? (
        <div className="flex items-center justify-center py-24 text-ink-400">
          <Spinner />{" "}
          <span className="ml-3 text-sm font-semibold">Memuat task…</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-surface py-20 text-center shadow-sm">
          <FolderKanban className="mx-auto h-8 w-8 text-ink-300" />
          <p className="mt-3 font-heading text-[16px] font-bold text-ink-900">
            Belum ada task di project ini
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
            Task akan muncul setelah admin membuatnya untuk project ini.
          </p>
        </div>
      ) : (
        <div
          className={`mt-6 grid gap-4 ${
            columns.length === 1
              ? "grid-cols-1"
              : "md:grid-cols-2 xl:grid-cols-4"
          }`}
        >
          {columns.map((col) => {
            const items = filtered.filter((t) => t.status === col);
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
                  // hanya lepas highlight bila benar-benar keluar kolom
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
                    <span
                      className={`h-2 w-2 rounded-full ${STATUS_META[col].dot}`}
                    />
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
                    {isOver ? "Lepaskan di sini" : "Tidak ada task"}
                  </div>
                ) : (
                  items.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      owned={task.assigneeId === myId}
                      busy={busyId === task.id}
                      draggable={canDrag(task)}
                      dragging={dragId === task.id}
                      onDragStart={() => setDragId(task.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverCol(null);
                      }}
                      onOpenDetail={() => setDetailId(task.id)}
                    />
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}

      {detailId && (
        <TaskDetailSheet
          taskId={detailId}
          fallback={tasks.find((t) => t.id === detailId) ?? null}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

function TaskCard({
  task,
  owned,
  busy,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
  onOpenDetail,
}: {
  task: TaskItem;
  owned: boolean;
  busy: boolean;
  draggable: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpenDetail: () => void;
}) {
  return (
    <article
      draggable={draggable && !busy}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-md border border-line bg-surface p-4 shadow-soft transition",
        draggable && !busy
          ? "cursor-grab active:cursor-grabbing hover:shadow-md"
          : "hover:shadow-md",
        dragging && "opacity-40",
        busy && "animate-pulse",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-bold text-ink-500 ring-1 ring-line">
          {task.workType.name}
        </span>
        {task.assignee && (
          <span className="truncate text-[11px] font-bold text-ink-500">
            {task.assignee.name}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenDetail}
        className="mt-2 block w-full text-left"
        title="Lihat detail task"
      >
        <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-ink-900 hover:text-brand-1">
          {task.title}
        </h3>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-400">
          Requester: {task.requester.name}
        </p>
      </button>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={task.priority} />
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-500">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatDateShortWIB(task.deadlineAt)}
        </span>
        {task.overdue && <OverdueBadge />}
      </div>

      <div className="mt-3">
        <TaskProgress
          loggedMinutes={task.loggedMinutes}
          estimatedHours={task.estimatedHours}
        />
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-line-soft pt-3">
        {owned &&
          (task.status === "done" ? (
            <span className="text-[12px] font-bold text-ink-400">Selesai</span>
          ) : null)}
        <div className="flex items-center gap-3">
          <Link
            href="/home"
            className="inline-flex items-center gap-1 text-[12.5px] font-bold text-brand-1 hover:underline"
          >
            Kerjakan <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
