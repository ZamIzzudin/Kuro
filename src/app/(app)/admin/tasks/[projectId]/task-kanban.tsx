"use client";

// Papan kanban TASK untuk admin & project manager — satu kartu = satu TASK INDUK
// (bukan subtask; subtask adalah unit kerja yang diambil freelancer).
// Kartu bisa digeser (drag & drop bawaan HTML5, tanpa dependensi) untuk mengubah
// status task. Status task juga otomatis mengikuti subtask (rollup).
import { useState } from "react";
import { CalendarDays, Layers } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { OverdueBadge, PriorityBadge, STATUS_META } from "@/components/task-bits";
import { cn } from "@/lib/utils";
import { formatDateShortWIB } from "@/lib/time";
import type { TaskItem } from "@/lib/tasks";

const COLUMNS: TaskStatus[] = ["todo", "in_progress", "review", "revision", "done"];

export function TaskKanban({
  tasks,
  busyId,
  onOpenDetail,
  onStatusChange,
}: {
  tasks: TaskItem[];
  busyId: string | null;
  onOpenDetail: (taskId: string) => void;
  onStatusChange: (task: TaskItem, status: TaskStatus) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  function dropTo(col: TaskStatus) {
    setOverCol(null);
    const task = tasks.find((t) => t.id === dragId);
    setDragId(null);
    if (!task || task.status === col || busyId) return;
    onStatusChange(task, col);
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {COLUMNS.map((col) => {
        const items = tasks.filter((t) => t.status === col);
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
                {isOver ? "Lepaskan di sini" : "Tidak ada task"}
              </div>
            ) : (
              items.map((t) => (
                <TaskKanbanCard
                  key={t.id}
                  task={t}
                  busy={busyId === t.id}
                  dragging={dragId === t.id}
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                  }}
                  onOpenDetail={() => onOpenDetail(t.id)}
                />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

function TaskKanbanCard({
  task: t,
  busy,
  dragging,
  onDragStart,
  onDragEnd,
  onOpenDetail,
}: {
  task: TaskItem;
  busy: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpenDetail: () => void;
}) {
  return (
    <article
      draggable={!busy}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", t.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-md border border-line bg-surface p-4 shadow-soft transition",
        !busy ? "cursor-grab active:cursor-grabbing hover:shadow-md" : "animate-pulse",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-bold text-ink-500 ring-1 ring-line">
          {t.workType.name}
        </span>
        <span className="truncate text-[11px] font-bold text-ink-500">
          {t.sprint ? t.sprint.name : "Backlog"}
        </span>
      </div>

      <button type="button" onClick={onOpenDetail} className="mt-2 block w-full text-left" title="Lihat detail task">
        <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-ink-900 hover:text-brand-1">
          {t.title}
        </h3>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-400">{t.project.name}</p>
      </button>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={t.priority} />
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-500">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatDateShortWIB(t.deadlineAt)}
        </span>
        {t.overdue && <OverdueBadge />}
        {t.beyondSprint && (
          <span className="rounded-full bg-pri-mediumbg px-2 py-0.5 text-[10.5px] font-bold text-status-review">
            lewat sprint
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line-soft pt-3">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-ink-500">
          <Layers className="h-3.5 w-3.5 text-ink-400" />
          {t.subtaskProgress.done}/{t.subtaskProgress.total} subtask
        </span>
        <span className="truncate text-[11.5px] font-semibold text-ink-500">
          {t.assignees.length === 0 ? "Belum di-assign" : t.assignees.map((a) => a.name).join(", ")}
        </span>
      </div>
    </article>
  );
}
