// Komponen UI dasar Kuro — mengikuti design guideline (button pill, input radius 12)
'use client'

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
}

// CATATAN DESAIN: button TIDAK PERNAH gradient — selalu warna solid dari palette.
// Primary = brand-1 (#8B2FF2) solid.

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold transition disabled:pointer-events-none disabled:opacity-60',
        size === 'sm' ? 'px-3.5 py-2 text-[13px]' : 'px-5 py-2.5 text-sm',
        variant === 'primary' &&
          'bg-brand-1 text-white shadow-brand hover:bg-[#7A1FE0] active:bg-[#6C1BC9]',
        variant === 'secondary' && 'border border-line bg-surface text-ink-900 hover:bg-surface-2',
        variant === 'ghost' && 'text-ink-700 hover:bg-surface-2',
        variant === 'danger' && 'bg-pri-highbg text-pri-high hover:opacity-90',
        className
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
})

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full rounded-md border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-300 focus:border-brand-1',
          className
        )}
        {...rest}
      />
    )
  }
)

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-bold text-ink-500">
      {children}
    </label>
  )
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'w-full appearance-none rounded-md border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink-900 outline-none transition focus:border-brand-1',
          className
        )}
        {...rest}
      >
        {children}
      </select>
    )
  }
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full rounded-md border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-300 focus:border-brand-1',
          className
        )}
        rows={4}
        {...rest}
      />
    )
  }
)

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] font-semibold text-[#DC2626]">
      {children}
    </p>
  )
}

export function SuccessNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-pri-lowbg px-3.5 py-2.5 text-[13px] font-semibold text-pri-low">
      {children}
    </p>
  )
}

/** Tooltip CSS murni — muncul saat hover/focus, tanpa dependensi. */
export function Tooltip({
  label,
  children,
  side = 'top',
  wrap = false,
  className,
}: {
  label: string
  children: React.ReactNode
  side?: 'top' | 'bottom'
  /** Izinkan teks panjang turun baris (mis. judul task) alih-alih memanjang. */
  wrap?: boolean
  className?: string
}) {
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-md bg-ink-900 px-2 py-1 text-[11.5px] font-semibold text-white opacity-0 shadow-md transition-opacity duration-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          wrap ? 'w-max max-w-[280px] text-left leading-snug' : 'whitespace-nowrap',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
        )}
      >
        {label}
      </span>
    </span>
  )
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  icon: React.ReactNode
  variant?: 'ghost' | 'secondary' | 'danger'
  loading?: boolean
}

/** Tombol ikon dengan tooltip — dipakai kolom aksi tabel agar hemat tempat. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', loading, className, disabled, ...rest },
  ref
) {
  return (
    <Tooltip label={label}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        disabled={disabled || loading}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-full transition disabled:pointer-events-none disabled:opacity-50',
          variant === 'ghost' && 'text-ink-500 hover:bg-surface-2 hover:text-brand-1',
          variant === 'secondary' && 'border border-line bg-surface text-ink-700 hover:bg-surface-2',
          variant === 'danger' && 'text-ink-500 hover:bg-pri-highbg hover:text-pri-high',
          className
        )}
        {...rest}
      >
        {loading ? <Spinner /> : icon}
      </button>
    </Tooltip>
  )
})
