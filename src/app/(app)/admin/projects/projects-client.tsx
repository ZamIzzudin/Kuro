"use client";

// Halaman admin: kelola Project lengkap (banner gambar/warna, requester, member).
// Enhancement dari master data lama yang hanya menyimpan nama.
import { useMemo, useRef, useState, type FormEvent } from "react";
import useSWR from "swr";
import {
  Image as ImageIcon,
  Palette,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import {
  Button,
  ErrorNote,
  FieldLabel,
  Input,
  Spinner,
  Textarea,
} from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { StatusBadge } from "@/components/pills";
import { apiSend, fetcher } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { ProjectItem } from "@/lib/projects";

type MasterOption = { id: string; name: string; isActive: boolean };
type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "freelancer";
  isActive: boolean;
};

/** Palet warna banner (konsisten dengan design system) */
const COLOR_PRESETS = [
  "#8B2FF2",
  "#D926C8",
  "#2F6FED",
  "#1FB673",
  "#F0932B",
  "#EF4444",
  "#0EA5E9",
  "#17161D",
];

export function ProjectsAdminClient() {
  const projectsReq = useSWR<{ projects: ProjectItem[] }>(
    "/api/projects",
    fetcher,
  );
  const requestersReq = useSWR<{ items: MasterOption[] }>(
    "/api/requesters",
    fetcher,
  );
  const usersReq = useSWR<{ users: UserRow[] }>("/api/users", fetcher);

  const [q, setQ] = useState("");
  const [formTarget, setFormTarget] = useState<ProjectItem | "create" | null>(
    null,
  );

  const projects = useMemo(
    () => projectsReq.data?.projects ?? [],
    [projectsReq.data],
  );
  const requesters = requestersReq.data?.items ?? [];
  const freelancers = (usersReq.data?.users ?? []).filter(
    (u) => u.role === "freelancer" && u.isActive,
  );

  const visible = projects.filter((p) =>
    p.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const loadError = projectsReq.error || requestersReq.error || usersReq.error;

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-extrabold">Project</h1>
          <p className="mt-1 text-sm text-ink-500">
            Kelola project beserta banner, requester, dan freelancer yang
            di-assign
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari project…"
              className="pl-9"
            />
          </div>
          <Button onClick={() => setFormTarget("create")}>
            <Plus className="h-4 w-4" strokeWidth={2.4} /> Project Baru
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

      {projectsReq.isLoading ? (
        <div className="flex items-center justify-center py-24 text-ink-400">
          <Spinner />{" "}
          <span className="ml-3 text-sm font-semibold">Memuat project…</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface py-20 text-center shadow-sm">
          <p className="text-sm font-bold text-ink-700">
            {projects.length === 0
              ? "Belum ada project"
              : "Project tidak ditemukan"}
          </p>
          <p className="mt-1 text-sm text-ink-500">
            {projects.length === 0
              ? "Klik “Project Baru” untuk menambah project pertama."
              : "Coba kata kunci lain."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <ProjectAdminCard
              key={p.id}
              project={p}
              onEdit={() => setFormTarget(p)}
            />
          ))}
        </div>
      )}

      {formTarget && (
        <ProjectFormSheet
          key={formTarget === "create" ? "create" : formTarget.id}
          initial={formTarget === "create" ? null : formTarget}
          requesters={requesters}
          freelancers={freelancers}
          onClose={() => setFormTarget(null)}
          onDone={() => projectsReq.mutate()}
        />
      )}
    </div>
  );
}

function BannerBlock({
  bannerUrl,
  bannerColor,
  className = "h-24 w-full",
}: {
  bannerUrl: string | null;
  bannerColor: string | null;
  className?: string;
}) {
  if (bannerUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={bannerUrl} alt="" className={cn("object-cover", className)} />
    );
  }
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      style={{
        background: bannerColor || "linear-gradient(135deg,#F4ECFF,#FAFAFB)",
      }}
    >
      {!bannerColor && <ImageIcon className="h-5 w-5 text-ink-300" />}
    </div>
  );
}

function ProjectAdminCard({
  project,
  onEdit,
}: {
  project: ProjectItem;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-soft">
      <BannerBlock
        bannerUrl={project.bannerUrl}
        bannerColor={project.bannerColor}
        className="h-28 w-full"
      />

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-heading text-[16px] font-extrabold text-ink-900">
            {project.name}
          </h2>
          <StatusBadge active={project.isActive} />
        </div>

        {project.description && (
          <p className="mt-1.5 line-clamp-2 text-[12.5px] text-ink-500">
            {project.description}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] font-bold">
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-500 ring-1 ring-line">
            {project.taskCount} task
          </span>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-500 ring-1 ring-line">
            {project.requesters.length} requester
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-brand-1">
            <Users className="h-3 w-3" /> {project.members.length} freelancer
          </span>
        </div>

        <div className="mt-4 flex justify-end border-t border-line-soft pt-3.5">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Ubah
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProjectFormSheet({
  initial,
  requesters,
  freelancers,
  onClose,
  onDone,
}: {
  initial: ProjectItem | null;
  requesters: MasterOption[];
  freelancers: UserRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  // Banner: 'image' | 'color' | 'none'
  const [bannerMode, setBannerMode] = useState<"image" | "color" | "none">(
    initial?.hasBanner ? "image" : initial?.bannerColor ? "color" : "none",
  );
  const [bannerColor, setBannerColor] = useState(
    initial?.bannerColor ?? COLOR_PRESETS[0],
  );
  const [bannerKey, setBannerKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initial?.bannerUrl ?? null,
  );
  const [uploading, setUploading] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [requesterIds, setRequesterIds] = useState<string[]>(
    initial?.requesters.map((r) => r.id) ?? [],
  );
  const [memberIds, setMemberIds] = useState<string[]>(
    initial?.members.map((m) => m.id) ?? [],
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggle(list: string[], id: string, setter: (v: string[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function onPickFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads/project-banner", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mengunggah gambar");
      setBannerKey(data.key as string);
      setPreviewUrl(URL.createObjectURL(file));
      setRemoveBanner(false);
      setBannerMode("image");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunggah gambar");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Tentukan nilai banner yang dikirim
    const payload: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      requesterIds,
      memberIds,
    };
    if (isEdit) payload.isActive = isActive;

    if (bannerMode === "color") {
      payload.bannerColor = bannerColor;
      payload.bannerKey = null; // warna menggantikan gambar
    } else if (bannerMode === "none") {
      payload.bannerColor = null;
      payload.bannerKey = null;
    } else {
      // mode gambar
      payload.bannerColor = null;
      if (bannerKey) payload.bannerKey = bannerKey;
      else if (removeBanner) payload.bannerKey = null;
    }

    try {
      if (isEdit && initial) {
        await apiSend(`/api/projects/${initial.id}`, "PATCH", payload);
      } else {
        await apiSend("/api/projects", "POST", payload);
      }
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={isEdit ? "Ubah Project" : "Project Baru"}
      description={isEdit ? initial!.name : "Lengkapi detail project"}
    >
      <form onSubmit={submit} className="space-y-5">
        {/* Banner */}
        <div>
          <FieldLabel>Banner</FieldLabel>
          <div className="overflow-hidden rounded-md border border-line">
            <BannerBlock
              bannerUrl={
                bannerMode === "image" && !removeBanner ? previewUrl : null
              }
              bannerColor={bannerMode === "color" ? bannerColor : null}
              className="h-32 w-full"
            />
          </div>

          <div className="mt-2.5 flex gap-1.5">
            {(
              [
                { key: "image", label: "Gambar", icon: ImageIcon },
                { key: "color", label: "Warna", icon: Palette },
                { key: "none", label: "Tanpa banner", icon: Trash2 },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setBannerMode(m.key);
                  if (m.key !== "image") setBannerKey(null);
                  if (m.key === "none") setRemoveBanner(true);
                  if (m.key === "image" && initial?.hasBanner)
                    setRemoveBanner(false);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition",
                  bannerMode === m.key
                    ? "bg-brand-1 text-white"
                    : "bg-surface-2 text-ink-500 ring-1 ring-line hover:text-ink-900",
                )}
              >
                <m.icon className="h-3.5 w-3.5" /> {m.label}
              </button>
            ))}
          </div>

          {bannerMode === "image" && (
            <div className="mt-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickFile(f);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {previewUrl && !removeBanner
                    ? "Ganti gambar"
                    : "Pilih gambar"}
                </Button>
                {previewUrl && !removeBanner && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRemoveBanner(true);
                      setBannerKey(null);
                      setPreviewUrl(null);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Hapus gambar
                  </Button>
                )}
              </div>
              <p className="mt-1.5 text-[12px] text-ink-400">
                PNG, JPEG, atau WebP. Maksimal 2 MB.
              </p>
            </div>
          )}

          {bannerMode === "color" && (
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Warna ${c}`}
                    onClick={() => setBannerColor(c)}
                    className={cn(
                      "h-8 w-8 rounded-[8px] ring-2 ring-offset-2 transition",
                      bannerColor.toLowerCase() === c.toLowerCase()
                        ? "ring-brand-1"
                        : "ring-transparent",
                    )}
                    style={{ background: c }}
                  />
                ))}
                <label className="ml-1 inline-flex items-center gap-2 text-[12px] font-bold text-ink-500">
                  Kustom
                  <input
                    type="color"
                    value={bannerColor}
                    onChange={(e) =>
                      setBannerColor(e.target.value.toUpperCase())
                    }
                    className="h-8 w-10 cursor-pointer rounded-sm border border-line bg-surface-2"
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        <div>
          <FieldLabel htmlFor="p-name">Nama project</FieldLabel>
          <Input
            id="p-name"
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="cth: Website Revamp"
          />
        </div>

        <div>
          <FieldLabel htmlFor="p-desc">Deskripsi (opsional)</FieldLabel>
          <Textarea
            id="p-desc"
            rows={3}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ringkasan singkat project"
          />
        </div>

        {/* Requester */}
        <div>
          <FieldLabel>Requester project</FieldLabel>
          {requesters.length === 0 ? (
            <p className="rounded-md bg-surface-2 px-3.5 py-3 text-[12.5px] font-semibold text-ink-500">
              Belum ada requester. Tambahkan dulu di Master Data → Requester.
            </p>
          ) : (
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-line bg-surface-2/60 p-2">
              {requesters.map((r) => (
                <label
                  key={r.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13px] hover:bg-surface"
                >
                  <input
                    type="checkbox"
                    checked={requesterIds.includes(r.id)}
                    onChange={() => toggle(requesterIds, r.id, setRequesterIds)}
                    className="h-4 w-4 accent-[#8B2FF2]"
                  />
                  <span
                    className={cn(
                      "font-semibold",
                      r.isActive ? "text-ink-900" : "text-ink-400",
                    )}
                  >
                    {r.name}
                    {!r.isActive && " (nonaktif)"}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Member / assign freelancer */}
        <div>
          <FieldLabel>Freelancer yang di-assign</FieldLabel>
          {freelancers.length === 0 ? (
            <p className="rounded-md bg-surface-2 px-3.5 py-3 text-[12.5px] font-semibold text-ink-500">
              Belum ada user freelancer aktif. Tambahkan dulu di halaman User.
            </p>
          ) : (
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-line bg-surface-2/60 p-2">
              {freelancers.map((u) => (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13px] hover:bg-surface"
                >
                  <input
                    type="checkbox"
                    checked={memberIds.includes(u.id)}
                    onChange={() => toggle(memberIds, u.id, setMemberIds)}
                    className="h-4 w-4 accent-[#8B2FF2]"
                  />
                  <span className="font-semibold text-ink-900">{u.name}</span>
                  <span className="text-[12px] text-ink-400">{u.email}</span>
                </label>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[12px] text-ink-400">
            Freelancer hanya melihat task pada project yang di-assign ke mereka.
          </p>
        </div>

        {isEdit && (
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold text-ink-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-[#8B2FF2]"
            />
            Project aktif
          </label>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={saving} disabled={uploading}>
            {isEdit ? "Simpan Perubahan" : "Simpan"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
