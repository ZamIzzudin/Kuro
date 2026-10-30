'use client'

// Sheet Clock Out bersama — dipakai di Home freelancer dan saat logout
// (agar freelancer tidak meninggalkan sesi berjalan tanpa catatan).
import { useState } from 'react'
import { Button, ErrorNote, FieldLabel, Select, Textarea } from '@/components/ui'
import { Sheet } from '@/components/sheet'
import { STATUS_META } from '@/components/task-bits'
import { AttachmentPicker, toAttachmentPayload, type PendingAttachment } from '@/components/attachment'
import { apiSend } from '@/lib/client'
import { useElapsedSeconds } from '@/hooks/use-elapsed'
import { formatTimer } from '@/lib/time'
import type { TimeEntryItem } from '@/lib/time-entries'

const CHECKOUT_STATUS = ['in_progress', 'review', 'done', 'todo'] as const

export function ClockOutSheet({
  entry,
  onClose,
  onDone,
  onError,
  title = 'Clock Out',
  submitLabel = 'Clock Out',
  allowSkip = false,
  onSkip,
}: {
  entry: TimeEntryItem
  onClose: () => void
  onDone: () => Promise<void>
  onError?: (msg: string | null) => void
  title?: string
  submitLabel?: string
  allowSkip?: boolean
  onSkip?: () => void
}) {
  const seconds = useElapsedSeconds(entry.clockInAt)
  const [note, setNote] = useState('')
  const [subtaskStatus, setSubtaskStatus] = useState<string>('in_progress')
  const [files, setFiles] = useState<PendingAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Subtask Done/Dibatalkan terkunci — hanya admin yang boleh mengubah statusnya.
  const locked = entry.subtask.status === 'done'
  const remaining = 10 - note.trim().length

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      await apiSend('/api/time-entries/clock-out', 'POST', {
        note: note.trim(),
        subtaskStatus,
        attachments: toAttachmentPayload(files),
      })
      await onDone()
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal clock out'
      setError(msg)
      onError?.(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={title} description={entry.subtask.title}>
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-2 px-4 py-3.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-ink-500">Durasi sesi ini</p>
          <p className="mt-1 text-[24px] font-extrabold text-ink-900 tabular-nums">{formatTimer(seconds)}</p>
        </div>

        <div>
          <FieldLabel htmlFor="co-note">Catatan pekerjaan</FieldLabel>
          <Textarea
            id="co-note"
            required
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Apa yang dikerjakan pada sesi ini? (minimal 10 karakter)"
          />
          <p className={`mt-1.5 text-[12px] font-semibold ${remaining > 0 ? 'text-ink-400' : 'text-pri-low'}`}>
            {remaining > 0 ? `Kurang ${remaining} karakter` : 'Catatan cukup'}
          </p>
        </div>

        <div>
          <FieldLabel htmlFor="co-status">Status subtask setelah sesi ini</FieldLabel>
          <Select
            id="co-status"
            value={locked ? entry.subtask.status : subtaskStatus}
            disabled={locked}
            onChange={(e) => setSubtaskStatus(e.target.value)}
          >
            {locked ? (
              <option value={entry.subtask.status}>{STATUS_META[entry.subtask.status].label}</option>
            ) : (
              CHECKOUT_STATUS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))
            )}
          </Select>
          {locked && (
            <p className="mt-1.5 text-[12px] font-semibold text-ink-400">
              Subtask sudah {entry.subtask.status === 'done' ? 'selesai' : 'dibatalkan'} — status hanya bisa diubah
              oleh admin. Clock out tetap menutup sesi ini.
            </p>
          )}
        </div>

        <div>
          <FieldLabel>Lampiran hasil kerja (opsional)</FieldLabel>
          <AttachmentPicker files={files} onChange={setFiles} disabled={saving} />
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex flex-col-reverse gap-2 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
          {allowSkip && (
            <Button variant="ghost" className="sm:mr-auto" onClick={onSkip} disabled={saving}>
              Logout tanpa clock out
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={submit} loading={saving} disabled={note.trim().length < 10}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
