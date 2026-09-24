'use client'

// Komponen lampiran bersama: pemilih berkas (unggah ke MinIO) + daftar lampiran.
// Dipakai di form task (admin), clock out (freelancer), dan sheet detail task.
import { useRef, useState } from 'react'
import { Download, FileText, Image as ImageIcon, Paperclip, Trash2, X } from 'lucide-react'
import { ErrorNote, Spinner } from '@/components/ui'
import { uploadAttachment } from '@/lib/client'
import type { AttachmentItem } from '@/lib/attachments'

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/** Lampiran yang sudah tersimpan (dari server). */
export function AttachmentList({
  items,
  onRemove,
  removingId,
}: {
  items: AttachmentItem[]
  onRemove?: (item: AttachmentItem) => void
  removingId?: string | null
}) {
  if (items.length === 0) return null
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li
          key={a.id}
          className="flex items-center gap-3 rounded-md border border-line bg-surface-2/60 px-3 py-2"
        >
          {a.isImage ? (
            <ImageIcon className="h-4 w-4 shrink-0 text-brand-1" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-ink-500" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-ink-900">{a.fileName}</p>
            <p className="text-[11.5px] text-ink-400">{formatBytes(a.size)}</p>
          </div>
          <a
            href={a.url}
            target="_blank"
            rel="noreferrer"
            title="Buka / unduh"
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-500 transition hover:bg-surface hover:text-brand-1"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
          {onRemove && (
            <button
              type="button"
              title="Hapus lampiran"
              onClick={() => onRemove(a)}
              disabled={removingId === a.id}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink-500 transition hover:bg-surface hover:text-pri-high disabled:opacity-50"
            >
              {removingId === a.id ? <Spinner /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Lampiran baru yang belum diunggah (preview lokal sebelum submit). */
export type PendingAttachment = {
  /** id sementara di sisi klien */
  localId: string
  fileName: string
  contentType: string
  size: number
  /** object key di storage (terisi setelah unggah sukses) */
  objectKey?: string
  /** status unggah */
  uploadError?: string
}

/**
 * Pemilih berkas: setiap berkas langsung diunggah, hasilnya (objectKey) dipakai
 * saat menyimpan task/time entry. Jumlah tidak dibatasi.
 */
export function AttachmentPicker({
  files,
  onChange,
  disabled,
  onError,
}: {
  files: PendingAttachment[]
  onChange: (files: PendingAttachment[]) => void
  disabled?: boolean
  onError?: (msg: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return
    setBusy(true)
    setError(null)
    const next = [...files]
    for (const file of Array.from(list)) {
      const localId = `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`
      const pending: PendingAttachment = {
        localId,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      }
      next.push(pending)
      onChange([...next])
      try {
        const meta = await uploadAttachment(file)
        const idx = next.findIndex((f) => f.localId === localId)
        if (idx >= 0) next[idx] = { ...next[idx], objectKey: meta.objectKey }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Gagal mengunggah berkas'
        const idx = next.findIndex((f) => f.localId === localId)
        if (idx >= 0) next[idx] = { ...next[idx], uploadError: msg }
        setError(msg)
        onError?.(msg)
      }
      onChange([...next])
    }
    setBusy(false)
  }

  function remove(localId: string) {
    onChange(files.filter((f) => f.localId !== localId))
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[13px] font-bold text-ink-900 transition hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-60"
      >
        {busy ? <Spinner /> : <Paperclip className="h-3.5 w-3.5" />}
        Tambah lampiran
      </button>
      <p className="mt-1.5 text-[12px] text-ink-400">
        Berkas atau gambar apa pun, jumlah tidak dibatasi. Maksimal 25 MB per berkas.
      </p>

      {files.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {files.map((f) => (
            <li
              key={f.localId}
              className="flex items-center gap-3 rounded-md border border-line bg-surface-2/60 px-3 py-2"
            >
              {f.contentType.startsWith('image/') ? (
                <ImageIcon className="h-4 w-4 shrink-0 text-brand-1" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-ink-500" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-ink-900">{f.fileName}</p>
                <p
                  className={`text-[11.5px] ${f.uploadError ? 'font-semibold text-pri-high' : 'text-ink-400'}`}
                >
                  {f.uploadError ? f.uploadError : f.objectKey ? formatBytes(f.size) : 'Mengunggah…'}
                </p>
              </div>
              <button
                type="button"
                title="Batalkan"
                onClick={() => remove(f.localId)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-500 transition hover:bg-surface hover:text-pri-high"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </div>
  )
}

/** Ubah pending → payload metadata untuk dikirim ke API (hanya yang sukses diunggah). */
export function toAttachmentPayload(files: PendingAttachment[]) {
  return files
    .filter((f): f is PendingAttachment & { objectKey: string } => Boolean(f.objectKey))
    .map((f) => ({
      objectKey: f.objectKey,
      fileName: f.fileName,
      contentType: f.contentType,
      size: f.size,
    }))
}
