"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { Pencil, Plus, Power, PowerOff } from "lucide-react";
import { Button, ErrorNote, FieldLabel, IconButton, Input, Spinner } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { StatusBadge } from "@/components/pills";
import { apiSend, fetcher } from "@/lib/client";

type MasterItem = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

const TABS = [
  {
    key: "work-types",
    label: "Jenis Pekerjaan",
    endpoint: "/api/work-types",
    hint: "Kategori pekerjaan untuk label jam (mis. Desain, Revisi)",
  },
  {
    key: "requesters",
    label: "Requester",
    endpoint: "/api/requesters",
    hint: "Penanggung jawab di sisi klien — dipilih saat membuat task & dikaitkan ke project",
  },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function MastersClient() {
  const [tab, setTab] = useState<TabKey>("work-types");
  const active = TABS.find((t) => t.key === tab)!;
  const { data, mutate, isLoading } = useSWR<{ items: MasterItem[] }>(
    active.endpoint,
    fetcher,
  );

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [renameFor, setRenameFor] = useState<MasterItem | null>(null);

  const items = data?.items ?? [];

  async function add(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(active.endpoint, "POST", { name: trimmed });
      setName("");
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambahkan");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: MasterItem) {
    setRowError(null);
    try {
      await apiSend(`${active.endpoint}/${item.id}`, "PATCH", {
        isActive: !item.isActive,
      });
      await mutate();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Gagal mengubah status");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading text-[22px] font-extrabold">Master</h1>
        <p className="mt-1 text-sm text-ink-500">
          Data acuan untuk task & time entry
        </p>
      </div>

      {/* Tab bar — underline solid brand (bukan gradient) */}
      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setName("");
              setError(null);
              setRowError(null);
            }}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-bold transition ${
              tab === t.key
                ? "border-brand-1 text-brand-1"
                : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tambah item */}
      <form onSubmit={add} className="mt-6 flex items-start gap-2">
        <div className="flex-1">
          <FieldLabel htmlFor="m-name">{`Tambah ${active.label}`}</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="m-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Nama ${active.label.toLowerCase()}`}
              maxLength={100}
            />
            <Button type="submit" loading={busy} className="shrink-0">
              <Plus className="h-4 w-4" strokeWidth={2.4} /> Tambah
            </Button>
          </div>
        </div>
      </form>
      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <p className="mt-3 text-[13px] text-ink-500">{active.hint}</p>

      {/* Daftar */}
      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-14 text-ink-400">
            <Spinner />{" "}
            <span className="ml-3 text-sm font-semibold">Memuat…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm font-bold text-ink-700">
              Belum ada {active.label.toLowerCase()}
            </p>
            <p className="mt-1 text-sm text-ink-500">
              Tambahkan lewat form di atas — dipakai saat membuat task.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p
                    className={`truncate font-bold ${
                      item.isActive
                        ? "text-ink-900"
                        : "text-ink-400 line-through"
                    }`}
                  >
                    {item.name}
                  </p>
                  <div className="mt-1">
                    <StatusBadge active={item.isActive} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    label={`Ubah ${item.name}`}
                    icon={<Pencil className="h-4 w-4" />}
                    onClick={() => setRenameFor(item)}
                  />
                  <IconButton
                    label={item.isActive ? "Nonaktifkan" : "Aktifkan"}
                    variant={item.isActive ? "danger" : "secondary"}
                    icon={
                      item.isActive ? (
                        <PowerOff className="h-4 w-4" />
                      ) : (
                        <Power className="h-4 w-4" />
                      )
                    }
                    onClick={() => toggle(item)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {rowError && (
        <div className="mt-3">
          <ErrorNote>{rowError}</ErrorNote>
        </div>
      )}

      <RenameSheet
        item={renameFor}
        endpoint={active.endpoint}
        onClose={() => setRenameFor(null)}
        onDone={() => mutate()}
      />
    </div>
  );
}

function RenameSheet({
  item,
  endpoint,
  onClose,
  onDone,
}: {
  item: MasterItem | null;
  endpoint: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [current, setCurrent] = useState<MasterItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Sinkron saat item berubah
  if (item && item !== current) {
    setCurrent(item);
    setName(item.name);
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      await apiSend(`${endpoint}/${current.id}`, "PATCH", {
        name: name.trim(),
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!item} onClose={onClose} title="Ubah Nama">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="rn-name">Nama</FieldLabel>
          <Input
            id="rn-name"
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={saving}>
            Simpan
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
