'use client'

// Modal generik — gaya modal design guideline (radius 22, shadow-lg, close bulat)
import { X } from 'lucide-react'

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-[rgba(20,18,32,0.45)]" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-[17px] font-bold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-ink-500 transition hover:text-ink-900"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.4} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
