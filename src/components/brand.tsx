import { cn } from '@/lib/utils'

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <div
      className="bg-brand-grad shrink-0"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      aria-hidden
    />
  )
}

export function Brand({
  size = 34,
  subtitle,
  compact,
  className,
}: {
  size?: number
  subtitle?: string
  compact?: boolean
  className?: string
}) {
  if (compact) {
    return (
      <div className={cn('flex justify-center', className)}>
        <BrandMark size={size} />
      </div>
    )
  }
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark size={size} />
      <div className="leading-tight">
        <div className="font-heading font-extrabold" style={{ fontSize: Math.round(size * 0.46) }}>
          Notu
        </div>
        {subtitle && <div className="text-[11px] text-ink-400">{subtitle}</div>}
      </div>
    </div>
  )
}
