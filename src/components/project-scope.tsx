'use client'

// Kuro — scope project untuk freelancer: dropdown di sidebar yang memfilter Task Bucket.
// Pilihan disimpan di localStorage per user agar bertahan antar halaman/relogin.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Check, ChevronDown, FolderKanban } from 'lucide-react'
import { fetcher } from '@/lib/client'
import { cn } from '@/lib/utils'
import type { ProjectItem } from '@/lib/projects'

type ScopeValue = {
  /** Project aktif; null hanya sesaat sebelum project pertama dipilih otomatis */
  projectId: string | null
  setProjectId: (id: string) => void
  projects: ProjectItem[]
  isLoading: boolean
  /** true bila freelancer belum di-assign ke project mana pun */
  hasNone: boolean
}

const ProjectScopeContext = createContext<ScopeValue | null>(null)

const STORAGE_PREFIX = 'kuro:project-scope:'

export function ProjectScopeProvider({
  userId,
  children,
}: {
  userId: string
  children: React.ReactNode
}) {
  const { data, isLoading } = useSWR<{ projects: ProjectItem[] }>('/api/projects', fetcher)
  const [projectId, setProjectIdState] = useState<string | null>(null)

  const projects = useMemo(() => data?.projects ?? [], [data])

  // Pulihkan pilihan tersimpan (hindari hydration mismatch)
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_PREFIX + userId)
    if (saved) setProjectIdState(saved)
  }, [userId])

  const setProjectId = useCallback(
    (id: string) => {
      setProjectIdState(id)
      window.localStorage.setItem(STORAGE_PREFIX + userId, id)
    },
    [userId]
  )

  // Project adalah konteks kerja: pilih otomatis project pertama bila belum ada,
  // dan buang pilihan yang tidak lagi valid (project nonaktif / membership dicabut).
  useEffect(() => {
    if (isLoading || projects.length === 0) return
    if (!projectId || !projects.some((p) => p.id === projectId)) {
      setProjectId(projects[0].id)
    }
  }, [isLoading, projectId, projects, setProjectId])

  const value: ScopeValue = {
    projectId,
    setProjectId,
    projects,
    isLoading,
    hasNone: !isLoading && projects.length === 0,
  }

  return <ProjectScopeContext.Provider value={value}>{children}</ProjectScopeContext.Provider>
}

export function useProjectScope(): ScopeValue {
  const ctx = useContext(ProjectScopeContext)
  if (!ctx) throw new Error('useProjectScope harus dipakai di dalam ProjectScopeProvider')
  return ctx
}

/** Dropdown pemilih project — hanya untuk freelancer, tampil di bawah logo Kuro. */
export function ProjectSwitcher({ compact = false }: { compact?: boolean }) {
  const { projectId, setProjectId, projects, isLoading, hasNone } = useProjectScope()
  const [open, setOpen] = useState(false)

  const current = projects.find((p) => p.id === projectId) ?? null

  // Sidebar dilipat → tampilkan ikon saja, buka sebagai daftar inline
  if (compact) {
    return (
      <div className="mb-1">
        {hasNone ? (
          <div
            title="Belum di-assign ke project"
            className="my-1 flex justify-center rounded-sm bg-surface-2 p-2 text-ink-400"
          >
            <FolderKanban className="h-4 w-4" />
          </div>
        ) : (
          <button
            type="button"
            title={current ? `Project: ${current.name}` : 'Pilih project'}
            onClick={() => setOpen((v) => !v)}
            className="mb-1 flex w-full items-center justify-center rounded-sm bg-brand-soft p-2 text-brand-1"
          >
            <FolderKanban className="h-4 w-4" />
          </button>
        )}
        {open && !hasNone && (
          <div className="mb-1 rounded-md border border-line bg-surface p-1 shadow-md">
            {projects.map((p) => (
              <ScopeOption
                key={p.id}
                label={p.name}
                selected={projectId === p.id}
                onClick={() => { setProjectId(p.id); setOpen(false) }}
                compact
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mb-2">
      <div className="px-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
        Project
      </div>
      {isLoading ? (
        <div className="h-9 animate-pulse rounded-sm bg-surface-2" />
      ) : hasNone ? (
        <div className="rounded-sm border border-dashed border-line bg-surface-2 px-3 py-2.5 text-[12px] font-semibold text-ink-400">
          Belum di-assign ke project
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex w-full items-center gap-2 rounded-sm border border-line bg-surface px-2.5 py-2 text-left transition hover:bg-surface-2"
          >
            {current?.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.bannerUrl}
                alt=""
                className="h-5 w-5 shrink-0 rounded-[5px] object-cover"
              />
            ) : (
              <span
                className="h-5 w-5 shrink-0 rounded-[5px] ring-1 ring-inset ring-black/5"
                style={{ background: current?.bannerColor || '#E9E8EE' }}
              />
            )}
            <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-900">
              {current?.name ?? 'Pilih project'}
            </span>
            <ChevronDown
              className={cn('h-3.5 w-3.5 shrink-0 text-ink-400 transition', open && 'rotate-180')}
            />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div
                role="listbox"
                className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-lg"
              >
                {projects.map((p) => (
                  <ScopeOption
                    key={p.id}
                    label={p.name}
                    color={p.bannerColor}
                    imageUrl={p.bannerUrl}
                    selected={projectId === p.id}
                    onClick={() => { setProjectId(p.id); setOpen(false) }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ScopeOption({
  label,
  selected,
  onClick,
  color,
  imageUrl,
  compact,
}: {
  label: string
  selected: boolean
  onClick: () => void
  color?: string | null
  imageUrl?: string | null
  compact?: boolean
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-[12.5px] transition',
        selected ? 'bg-brand-soft font-bold text-brand-1' : 'font-medium text-ink-700 hover:bg-surface-2',
        compact && 'text-[12px]'
      )}
    >
      {color !== undefined || imageUrl !== undefined ? (
        imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-4 w-4 shrink-0 rounded-[4px] object-cover" />
        ) : (
          <span
            className="h-4 w-4 shrink-0 rounded-[4px] ring-1 ring-inset ring-black/5"
            style={{ background: color || '#E9E8EE' }}
          />
        )
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} />}
    </button>
  )
}
