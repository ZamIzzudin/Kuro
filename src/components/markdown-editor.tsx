'use client'

// Editor deskripsi Markdown sederhana: textarea + pratinjau (tab Tulis/Pratinjau).
// Dipakai untuk Sprint goal, deskripsi Task, dan deskripsi Subtask.
import { useState } from 'react'
import { Eye, Pencil } from 'lucide-react'
import { Textarea } from '@/components/ui'
import { Markdown } from '@/components/markdown'
import { cn } from '@/lib/utils'

export function MarkdownEditor({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength = 20_000,
  label,
  disabled,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  maxLength?: number
  label?: string
  disabled?: boolean
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')

  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line-soft px-2 py-1.5">
        <span className="text-[11.5px] font-bold uppercase tracking-wide text-ink-400">{label ?? 'Markdown'}</span>
        <div className="flex rounded-full bg-surface-2 p-0.5 ring-1 ring-line">
          {(
            [
              { key: 'write', icon: <Pencil className="h-3.5 w-3.5" />, label: 'Tulis' },
              { key: 'preview', icon: <Eye className="h-3.5 w-3.5" />, label: 'Pratinjau' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold transition',
                tab === t.key ? 'bg-surface text-brand-1 shadow-soft' : 'text-ink-500 hover:text-ink-900',
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'write' ? (
        <Textarea
          id={id}
          rows={rows}
          value={value}
          maxLength={maxLength}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="rounded-none border-0 shadow-none focus:ring-0"
        />
      ) : value.trim() === '' ? (
        <p className="px-4 py-6 text-center text-[12.5px] font-semibold text-ink-400">
          Belum ada isi untuk dipratinjau.
        </p>
      ) : (
        <div className="px-4 py-3">
          <Markdown>{value}</Markdown>
        </div>
      )}
    </div>
  )
}
