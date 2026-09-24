"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  ChevronRight,
  FolderKanban,
  UserPlus,
} from "lucide-react";
import { ErrorNote, Input, Spinner } from "@/components/ui";
import { TaskStatusDonut } from "@/components/status-donut";
import { fetcher } from "@/lib/client";
import type { ProjectOverview } from "@/lib/tasks";

export function AdminProjectsClient() {
  const { data, isLoading, error } = useSWR<{ projects: ProjectOverview[] }>(
    "/api/projects/overview",
    fetcher,
  );
  const [q, setQ] = useState("");

  const projects = useMemo(() => data?.projects ?? [], [data]);
  const visible = projects.filter((p) =>
    p.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-extrabold">Task</h1>
          <p className="mt-1 text-sm text-ink-500">
            Pilih project untuk melihat & mengelola task di dalamnya
          </p>
        </div>
        <div className="w-56">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari project…"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorNote>
            {error instanceof Error ? error.message : "Gagal memuat project"}
          </ErrorNote>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-ink-400">
          <Spinner />{" "}
          <span className="ml-3 text-sm font-semibold">Memuat project…</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface py-20 text-center shadow-sm">
          <FolderKanban className="mx-auto h-8 w-8 text-ink-300" />
          <p className="mt-3 font-heading text-[16px] font-bold text-ink-900">
            {projects.length === 0
              ? "Belum ada project"
              : "Project tidak ditemukan"}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
            {projects.length === 0 ? (
              <>
                Tambahkan project dulu di{" "}
                <Link
                  href="/admin/projects"
                  className="font-bold text-brand-1 hover:underline"
                >
                  halaman Project
                </Link>
                .
              </>
            ) : (
              "Coba kata kunci lain."
            )}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <Link
              key={p.id}
              href={`/admin/tasks/${p.id}`}
              className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-soft transition hover:border-brand-1/30 hover:shadow-md"
            >
              <div
                className="h-20 w-full"
                style={
                  p.bannerUrl
                    ? undefined
                    : {
                        background:
                          p.bannerColor ||
                          "linear-gradient(135deg,#F4ECFF,#FAFAFB)",
                      }
                }
              >
                {p.bannerUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.bannerUrl}
                    alt=""
                    className="h-20 w-full object-cover"
                  />
                )}
              </div>

              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-heading text-[16px] font-extrabold text-ink-900">
                        {p.name}
                      </h2>
                      {!p.isActive && (
                        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-400 ring-1 ring-line">
                          Nonaktif
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12.5px] text-ink-500">
                      {p.total} task · {p.active} Perlu Diproses
                    </p>
                  </div>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-300 transition group-hover:text-brand-1" />
                </div>

                {(p.overdue > 0 || p.unassigned > 0) && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {p.overdue > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-pri-highbg px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-pri-high">
                        <AlertTriangle className="h-3 w-3" /> {p.overdue}{" "}
                        overdue
                      </span>
                    )}
                    {p.unassigned > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-500 ring-1 ring-line">
                        <UserPlus className="h-3 w-3" /> {p.unassigned} belum
                        di-assign
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-4 border-t border-line-soft pt-4">
                  <TaskStatusDonut counts={p.counts} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
