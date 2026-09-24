'use client'

// Avatar user — foto profil (bila ada) atau inisial di lingkaran brand.
import { cn } from '@/lib/utils'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({
  name,
  src,
  size = 36,
  className,
}: {
  name: string
  src?: string | null
  size?: number
  className?: string
}) {
  const fontSize = Math.round(size * 0.38)
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft font-bold text-brand-1 ring-1 ring-inset ring-black/5',
        className
      )}
      style={{ width: size, height: size, fontSize }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  )
}
