// Badge kecil: role & status aktif
export function RoleBadge({ role }: { role: 'admin' | 'freelancer' }) {
  return (
    <span
      className={
        role === 'admin'
          ? 'inline-block rounded-full bg-brand-soft px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-brand-1'
          : 'inline-block rounded-full bg-surface-2 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-500 ring-1 ring-line'
      }
    >
      {role === 'admin' ? 'Admin' : 'Freelancer'}
    </span>
  )
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? 'inline-flex items-center gap-1.5 rounded-full bg-pri-lowbg px-3 py-1 text-[11px] font-bold text-pri-low'
          : 'inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-[11px] font-bold text-ink-400 ring-1 ring-line'
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-pri-low' : 'bg-ink-300'}`} />
      {active ? 'Aktif' : 'Nonaktif'}
    </span>
  )
}
