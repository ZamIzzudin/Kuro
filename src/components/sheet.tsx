'use client'

// Sheet — panel geser dari kanan (desktop) / bawah (mobile).
// Menggantikan Modal: radius 22, shadow-lg, close bulat.
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Sheet({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  size?: 'md' | 'lg'
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50',
        open ? 'pointer-events-auto' : 'pointer-events-none'
      )}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-[rgba(20,18,32,0.45)] transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Panel: bawah di mobile, kanan di desktop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'absolute flex flex-col bg-surface shadow-lg transition-transform duration-300 ease-out',
          // Mobile — bottom sheet
          'inset-x-0 bottom-0 max-h-[90vh] w-full rounded-t-xl border-t border-line',
          // Desktop — right drawer
          'sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-0 sm:h-full sm:max-h-none sm:rounded-none sm:rounded-l-xl sm:border-l sm:border-t-0',
          size === 'md' ? 'sm:w-[440px]' : 'sm:w-[620px]',
          open
            ? 'translate-y-0 sm:translate-x-0'
            : 'translate-y-full sm:translate-y-0 sm:translate-x-full'
        )}
      >
        {/* Handle (mobile) */}
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line sm:hidden" />

        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 className="font-heading text-[17px] font-bold text-ink-900">{title}</h3>
            {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-500 transition hover:text-ink-900"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.4} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  )
}
