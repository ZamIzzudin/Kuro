// Komponen UI dasar Notu — mengikuti design guideline (button pill, input radius 12)
'use client'

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'
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
        variant === 'primary' && 'bg-brand-grad text-white shadow-brand hover:opacity-95',
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
