"use client";

// Kelola Sprint per project — daftar sprint, buat/ubah, aktifkan, tutup (carry-over ke backlog).
import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Target,
  Trash2,
} from "lucide-react";
import type { SprintStatus } from "@prisma/client";
import {
  Button,
  ErrorNote,
  FieldLabel,
  IconButton,
  Input,
  Select,
  Spinner,
  Tooltip,
} from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Markdown } from "@/components/markdown";
import { apiSend, fetcher } from "@/lib/client";
import { formatDateWIB, todayWibDate } from "@/lib/time";
import type { SprintItem } from "@/lib/sprints";
import type { ProjectItem } from "@/lib/projects";

const STATUS_META: Record<SprintStatus, { label: string; chip: string }> = {
  planned: { label: "Direncanakan", chip: "bg-surface-2 text-ink-500 ring-1 ring-line" },
  active: { label: "Aktif", chip: "bg-pri-lowbg text-pri-low" },
  completed: { label: "Selesai", chip: "bg-brand-soft text-brand-1" },
};

export function SprintsClient() {
  const searchParams = useSearchParams();
  const initialProject = searchParams.get("projectId") ?? "";
  const [projectId, setProjectId] = useState(initialProject);
  const [formTarget, setFormTarget] = useState<SprintItem | "create" | null>(null);
  const [completeTarget, setCompleteTarget] = useState<SprintItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SprintItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectsReq = useSWR<{ projects: ProjectItem[] }>("/api/projects", fetcher);
  const projects = useMemo(() => projectsReq.data?.projects ?? [], [projectsReq.data]);
  const activeProjectId = projectId || projects[0]?.id || "";

  const sprintsReq = useSWR<{ sprints: SprintItem[] }>(
    activeProjectId ? `/api/sprints?projectId=${activeProjectId}` : null,
    fetcher,
  );
  const sprints = useMemo(() => sprintsReq.data?.sprints ?? [], [sprintsReq.data]);
  const project = projects.find((p) => p.id === activeProjectId);

  async function setStatus(s: SprintItem, status: SprintStatus) {
    setError(null);
    try {
      await apiSend(`/api/sprints/${s.id}`, "PATCH", { status });
      await Promise.all([sprintsReq.mutate(), projectsReq.mutate()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah status sprint");
    }
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <Link
        href="/admin/tasks"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-500 hover:text-brand-1"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Task
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-extrabold">Sprint</h1>
          <p className="mt-1 text-sm text-ink-500">
            Satu sprint aktif per project · task di luar sprint masuk Backlog
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-56">
            <span className="mb-1.5 block text-[12.5px] font-bold text-ink-500">Project</span>
            <Select value={activeProjectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={() => setFormTarget("create")} disabled={!activeProjectId}>
            <Plus className="h-4 w-4" strokeWidth={2.4} /> Buat Sprint
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {sprintsReq.error && (
        <div className="mb-4">
          <ErrorNote>
            {sprintsReq.error instanceof Error ? sprintsReq.error.message : "Gagal memuat sprint"}
          </ErrorNote>
        </div>
      )}

      {sprintsReq.isLoading ? (
        <div className="flex items-center justify-center py-24 text-ink-400">
          <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat sprint…</span>
        </div>
      ) : sprints.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface py-20 text-center shadow-sm">
          <CalendarRange className="mx-auto h-8 w-8 text-ink-300" />
          <p className="mt-3 font-heading text-[16px] font-bold text-ink-900">Belum ada sprint</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
            Buat sprint pertama, lalu masukkan task ke dalamnya.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sprints.map((s) => (
            <SprintCard
              key={s.id}
              sprint={s}
              onEdit={() => setFormTarget(s)}
              onActivate={() => setStatus(s, "active")}
              onComplete={() => setCompleteTarget(s)}
              onReopen={() => setStatus(s, "planned")}
              onDelete={() => setDeleteTarget(s)}
            />
          ))}
        </div>
      )}

      {formTarget && (
        <SprintFormSheet
          key={formTarget === "create" ? "create" : formTarget.id}
          projectId={activeProjectId}
          projectName={project?.name ?? ""}
          initial={formTarget === "create" ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onDone={() => Promise.all([sprintsReq.mutate(), projectsReq.mutate()])}
        />
      )}

      <CompleteSheet
        sprint={completeTarget}
        otherSprints={sprints.filter((s) => s.id !== completeTarget?.id)}
        onClose={() => setCompleteTarget(null)}
        onDone={() => Promise.all([sprintsReq.mutate(), projectsReq.mutate()])}
        onError={setError}
      />

      <DeleteSheet
        sprint={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDone={() => Promise.all([sprintsReq.mutate(), projectsReq.mutate()])}
        onError={setError}
      />
    </div>
  );
}

function SprintCard({
  sprint,
  onEdit,
  onActivate,
  onComplete,
  onReopen,
  onDelete,
}: {
  sprint: SprintItem;
  onEdit: () => void;
  onActivate: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onDelete: () => void;
}) {
  const meta = STATUS_META[sprint.status];
  const pct = sprint.progress.total === 0 ? 0 : Math.round((sprint.progress.done / sprint.progress.total) * 100);

  return (
    <div className="flex flex-col rounded-lg border border-line bg-surface p-5 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-heading text-[16px] font-extrabold text-ink-900">{sprint.name}</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide ${meta.chip}`}>
              {meta.label}
            </span>
          </div>
          <p className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] text-ink-500">
            <CalendarRange className="h-3.5 w-3.5" />
            {formatDateWIB(sprint.startDate)} – {formatDateWIB(sprint.endDate)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Ubah sprint" icon={<Pencil className="h-4 w-4" />} onClick={onEdit} />
          <IconButton
            label="Hapus sprint"
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={onDelete}
          />
        </div>
      </div>

      {sprint.goal && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-surface-2/60 px-3 py-2.5">
          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-1" />
          <div className="min-w-0">
            <Markdown>{sprint.goal}</Markdown>
          </div>
        </div>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between text-[12px] font-bold text-ink-500">
          <span>
            {sprint.progress.done}/{sprint.progress.total} task selesai
          </span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-brand-1 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {(sprint.progress.overdue > 0 || sprint.progress.beyondDeadline > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {sprint.progress.overdue > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-pri-highbg px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-pri-high">
              <AlertTriangle className="h-3 w-3" /> {sprint.progress.overdue} overdue
            </span>
          )}
          {sprint.progress.beyondDeadline > 0 && (
            <Tooltip label="Deadline task melewati tanggal selesai sprint" side="top" wrap>
              <span className="inline-flex items-center gap-1 rounded-full bg-pri-mediumbg px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-status-review">
                <AlertTriangle className="h-3 w-3" /> {sprint.progress.beyondDeadline} lewat sprint
              </span>
            </Tooltip>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
        {sprint.status === "planned" && (
          <Button size="sm" onClick={onActivate}>
            <Play className="h-3.5 w-3.5" /> Aktifkan
          </Button>
        )}
        {sprint.status === "active" && (
          <Button size="sm" onClick={onComplete}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Tutup Sprint
          </Button>
        )}
        {sprint.status === "completed" && (
          <Button size="sm" variant="secondary" onClick={onReopen}>
            <RotateCcw className="h-3.5 w-3.5" /> Buka Kembali
          </Button>
        )}
        <Link
          href={`/admin/tasks/${sprint.projectId}`}
          className="ml-auto text-[12.5px] font-bold text-brand-1 hover:underline"
        >
          Lihat task project
        </Link>
      </div>
    </div>
  );
}

function SprintFormSheet({
  projectId,
  projectName,
  initial,
  onClose,
  onDone,
}: {
  projectId: string;
  projectName: string;
  initial: SprintItem | null;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayWibDate());
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      projectId,
      name: name.trim(),
      goal: goal.trim() || null,
      startDate,
      endDate,
    };
    try {
      if (isEdit && initial) {
        await apiSend(`/api/sprints/${initial.id}`, "PATCH", {
          name: payload.name,
          goal: payload.goal,
          startDate,
          endDate,
        });
      } else {
        await apiSend("/api/sprints", "POST", payload);
      }
      await onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan sprint");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={isEdit ? "Ubah Sprint" : "Buat Sprint"}
      description={`Project: ${projectName}`}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="s-name">Nama sprint</FieldLabel>
          <Input
            id="s-name"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="cth: Sprint 1 — Fondasi"
          />
        </div>

        <div>
          <FieldLabel>Sprint Goal (Markdown, opsional)</FieldLabel>
          <MarkdownEditor
            id="s-goal"
            value={goal}
            onChange={setGoal}
            placeholder="Tujuan sprint dalam satu pernyataan…"
            rows={3}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="s-start">Tanggal mulai</FieldLabel>
            <Input
              id="s-start"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="s-end">Tanggal selesai</FieldLabel>
            <Input
              id="s-end"
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
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

function CompleteSheet({
  sprint,
  otherSprints,
  onClose,
  onDone,
  onError,
}: {
  sprint: SprintItem | null;
  otherSprints: SprintItem[];
  onClose: () => void;
  onDone: () => Promise<unknown>;
  onError: (msg: string | null) => void;
}) {
  const [moveTo, setMoveTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!sprint) return;
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/api/sprints/${sprint.id}`, "POST", {
        moveToSprintId: moveTo || null,
      });
      await onDone();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menutup sprint";
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!sprint} onClose={onClose} title="Tutup Sprint">
      <div className="space-y-4">
        <p className="text-sm text-ink-700">
          Tutup <span className="font-bold">“{sprint?.name}”</span>? Task yang belum selesai akan
          dikeluarkan dari sprint ini dan bisa dikerjakan kembali pada sprint berikutnya.
        </p>

        <div>
          <FieldLabel htmlFor="move-to">Pindahkan task belum selesai ke</FieldLabel>
          <Select id="move-to" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">Backlog (di luar sprint)</option>
            {otherSprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-[12px] text-ink-400">
            Task yang sudah selesai tetap tercatat sebagai hasil sprint ini.
          </p>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={confirm} loading={saving}>
            <CheckCircle2 className="h-4 w-4" /> Tutup Sprint
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function DeleteSheet({
  sprint,
  onClose,
  onDone,
  onError,
}: {
  sprint: SprintItem | null;
  onClose: () => void;
  onDone: () => Promise<unknown>;
  onError: (msg: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!sprint) return;
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/api/sprints/${sprint.id}`, "DELETE");
      await onDone();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus sprint";
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!sprint} onClose={onClose} title="Hapus Sprint">
      <div className="space-y-4">
        <p className="rounded-lg bg-pri-highbg px-3.5 py-2.5 text-[13px] font-semibold text-pri-high">
          Menghapus sprint tidak menghapus task. Task akan dilepas ke Backlog.
        </p>
        <p className="text-sm text-ink-700">
          Yakin menghapus <span className="font-bold">“{sprint?.name}”</span>?
        </p>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Kembali
          </Button>
          <Button variant="danger" loading={saving} onClick={confirm}>
            Hapus permanen
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
