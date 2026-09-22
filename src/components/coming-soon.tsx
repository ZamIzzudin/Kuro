// Empty state "menyusul" — pola empty state design guideline
import type { LucideIcon } from 'lucide-react'

export function ComingSoon({
  icon: Icon,
  title,
  description,
  phase,
}: {
  icon: LucideIcon
  title: string
  description: string
  phase: string
}) {
  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-lg border-[1.5px] border-dashed border-line px-5 py-11 text-center">
        <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-brand-soft text-brand-1">
          <Icon className="h-6 w-6" strokeWidth={2} />
        </div>
        <h3 className="mb-1.5 text-[15px] font-bold">{title}</h3>
        <p className="mb-4 text-[13px] leading-relaxed text-ink-400">{description}</p>
        <span className="inline-block rounded-full bg-surface-2 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-400 ring-1 ring-line">
          {phase}
        </span>
      </div>
    </div>
  )
}
