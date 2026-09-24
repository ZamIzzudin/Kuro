'use client'

// Halaman Rekap & Export (Fase 5 / F5): pilih periode + freelancer → tabel rekap
// bertingkat, export XLSX/PDF, dan lock/unlock periode.
import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Lock,
  LockOpen,
  Users,
} from 'lucide-react'
import { Button, ErrorNote, FieldLabel, Select, Spinner, Textarea, Tooltip } from '@/components/ui'
import { Sheet } from '@/components/sheet'
import { apiSend, fetcher } from '@/lib/client'
import { MONTH_NAMES, formatMinutes, formatWIB, periodLabel } from '@/lib/time'
import type { PeriodLockItem, ReportResponse, ReportUser } from '@/lib/reports'

type UserOption = { id: string; name: string; role: 'admin' | 'freelancer'; isActive: boolean }

export function ReportsClient() {
  const now = new Date()
  const currentYear = Number(formatWIB(now, 'yyyy'))
  const currentMonth = Number(formatWIB(now, 'MM'))

  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [selected, setSelected] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [unlockTarget, setUnlockTarget] = useState<PeriodLockItem | null>(null)
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [locking, setLocking] = useState(false)

  const usersReq = useSWR<{ users: UserOption[] }>('/api/users', fetcher)
  const locksReq = useSWR<{ locks: PeriodLockItem[] }>('/api/period-locks', fetcher)

  const qs = useMemo(() => {
    const p = new URLSearchParams({ year: String(year), month: String(month) })
    if (selected.length) p.set('userIds', selected.join(','))
    return p.toString()
  }, [year, month, selected])

  const reportReq = useSWR<ReportResponse>(`/api/reports/summary?${qs}`, fetcher)
  const report = reportReq.data

  const freelancers = (usersReq.data?.users ?? []).filter((u) => u.role === 'freelancer')
  const locks = locksReq.data?.locks ?? []
  const activeLock = locks.find((l) => l.year === year && l.month === month) ?? null

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  function toggleUser(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function exportFile(format: 'xlsx' | 'pdf') {
    window.location.href = `/api/reports/export?${qs}&format=${format}`
  }

  async function lockPeriod() {
    setLocking(true)
    setBanner(null)
    try {
      await apiSend('/api/period-locks', 'POST', { year, month })
      await locksReq.mutate()
      setBanner({ type: 'ok', text: `Periode ${periodLabel(year, month)} berhasil dikunci.` })
    } catch (e) {
      setBanner({ type: 'err', text: e instanceof Error ? e.message : 'Gagal mengunci periode' })
    } finally {
      setLocking(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1240px]">
      <div className="mb-5">
        <h1 className="font-heading text-[22px] font-extrabold">Rekap & Export</h1>
        <p className="mt-1 text-sm text-ink-500">
          Rekap jam kerja bulanan per freelancer, unduh XLSX/PDF, dan kunci periode yang sudah final
        </p>
      </div>

      {banner && (
        <div className="mb-4">
          {banner.type === 'ok' ? (
            <p className="rounded-lg bg-pri-lowbg px-3.5 py-2.5 text-[13px] font-semibold text-pri-low">
              {banner.text}
            </p>
          ) : (
            <ErrorNote>{banner.text}</ErrorNote>
          )}
        </div>
      )}

      {/* Filter periode */}
      <div className="rounded-lg border border-line bg-surface p-5 shadow-soft">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-28">
            <FieldLabel htmlFor="rp-month">Bulan</FieldLabel>
            <Select id="rp-month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-28">
            <FieldLabel htmlFor="rp-year">Tahun</FieldLabel>
            <Select id="rp-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-[240px] flex-1">
            <FieldLabel>
              Freelancer {selected.length > 0 && `(${selected.length} dipilih)`}
            </FieldLabel>
            <div className="flex flex-wrap gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-2">
              {freelancers.length === 0 ? (
                <span className="text-[12.5px] text-ink-400">Tidak ada freelancer</span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setSelected([])}
                    className={`rounded-full px-2.5 py-1 text-[12px] font-bold transition ${
                      selected.length === 0
                        ? 'bg-brand-1 text-white'
                        : 'bg-surface text-ink-500 ring-1 ring-line hover:text-ink-900'
                    }`}
                  >
                    Semua
                  </button>
                  {freelancers.map((f) => {
                    const on = selected.includes(f.id)
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleUser(f.id)}
                        className={`rounded-full px-2.5 py-1 text-[12px] font-bold transition ${
                          on
                            ? 'bg-brand-1 text-white'
                            : 'bg-surface text-ink-500 ring-1 ring-line hover:text-ink-900'
                        }`}
                      >
                        {f.name}
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
          <Button size="sm" variant="secondary" onClick={() => exportFile('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" /> Export XLSX
          </Button>
          <Button size="sm" variant="secondary" onClick={() => exportFile('pdf')}>
            <FileText className="h-4 w-4" /> Export PDF
          </Button>

          <div className="ml-auto flex items-center gap-3">
            {activeLock ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FDF1E2] px-3 py-1 text-[11.5px] font-bold text-status-review">
                  <Lock className="h-3 w-3" /> Terkunci {formatWIB(activeLock.lockedAt, 'dd MMM yyyy')}
                </span>
                <Button size="sm" variant="secondary" onClick={() => setUnlockTarget(activeLock)}>
                  <LockOpen className="h-4 w-4" /> Buka Kunci
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={lockPeriod} loading={locking}>
                <Lock className="h-4 w-4" /> Kunci Periode Ini
              </Button>
            )}
          </div>
        </div>

        {activeLock && (
          <p className="mt-2 text-[12px] text-ink-500">
            Terkunci oleh {activeLock.lockedBy.name}
            {activeLock.note ? ` — ${activeLock.note}` : ''}. Freelancer tidak dapat mengubah jam kerja
            pada periode ini.
          </p>
        )}
      </div>

      {/* Tabel rekap */}
      <div className="mt-5">
        {reportReq.error ? (
          <ErrorNote>
            {reportReq.error instanceof Error ? reportReq.error.message : 'Gagal memuat rekap'}
          </ErrorNote>
        ) : reportReq.isLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-line bg-surface py-20 text-ink-400">
            <Spinner /> <span className="ml-3 text-sm font-semibold">Memuat rekap…</span>
          </div>
        ) : !report || report.users.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface py-16 text-center shadow-soft">
            <Users className="mx-auto h-7 w-7 text-ink-300" />
            <p className="mt-3 font-heading text-[15px] font-bold text-ink-900">Belum ada data</p>
            <p className="mt-1 text-sm text-ink-500">
              Tidak ada freelancer atau catatan jam kerja pada periode ini.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-[16px] font-bold text-ink-900">
                Rekap {periodLabel(year, month)}
              </h2>
              <p className="text-[13px] text-ink-500">
                Total <span className="font-extrabold text-ink-900">{formatMinutes(report.totalMinutes)}</span>{' '}
                · {report.users.length} freelancer
              </p>
            </div>

            <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-2/60 text-left text-[11px] font-bold uppercase tracking-wider text-ink-400">
                    <th className="w-8 px-4 py-3" />
                    <th className="px-4 py-3">Freelancer</th>
                    <th className="px-4 py-3 text-right">Total Jam</th>
                    <th className="px-4 py-3 text-right">Hari Kerja</th>
                    <th className="px-4 py-3 text-right">Sesi</th>
                    <th className="w-24 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {report.users.map((u) => (
                    <UserRows
                      key={u.id}
                      user={u}
                      open={expanded === u.id}
                      onToggle={() => setExpanded(expanded === u.id ? null : u.id)}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line bg-surface-2/40 font-bold text-ink-900">
                    <td />
                    <td className="px-4 py-3">TOTAL</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMinutes(report.totalMinutes)}</td>
                    <td className="px-4 py-3 text-right">
                      {report.users.reduce((s, u) => s + u.workDays, 0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {report.users.reduce((s, u) => s + u.entryCount, 0)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Daftar periode terkunci */}
      {locks.length > 0 && (
        <div className="mt-6 rounded-lg border border-line bg-surface p-5 shadow-soft">
          <h2 className="mb-3 font-heading text-[15px] font-bold text-ink-900">Periode Terkunci</h2>
          <ul className="divide-y divide-line-soft">
            {locks.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Lock className="h-3.5 w-3.5 shrink-0 text-status-review" />
                <span className="text-[13.5px] font-bold text-ink-900">
                  {periodLabel(l.year, l.month)}
                </span>
                <span className="text-[12.5px] text-ink-500">
                  oleh {l.lockedBy.name} · {formatWIB(l.lockedAt, 'dd MMM yyyy HH.mm')}
                </span>
                {l.note && <span className="text-[12.5px] text-ink-400">— {l.note}</span>}
                <button
                  onClick={() => setUnlockTarget(l)}
                  className="ml-auto text-[12.5px] font-bold text-brand-1 hover:underline"
                >
                  Buka kunci
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {unlockTarget && (
        <UnlockSheet
          lock={unlockTarget}
          onClose={() => setUnlockTarget(null)}
          onDone={async () => {
            await locksReq.mutate()
            setBanner({
              type: 'ok',
              text: `Kunci periode ${periodLabel(unlockTarget.year, unlockTarget.month)} dibuka.`,
            })
          }}
          onError={(msg) => setBanner({ type: 'err', text: msg })}
        />
      )}
    </div>
  )
}

function UserRows({
  user,
  open,
  onToggle,
}: {
  user: ReportUser
  open: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="border-t border-line transition hover:bg-surface-2/50">
        <td className="px-4 py-3">
          <Tooltip label={open ? 'Tutup rincian' : 'Buka rincian'}>
            <button
              onClick={onToggle}
              aria-label={open ? 'Tutup rincian' : 'Buka rincian'}
              className="flex h-6 w-6 items-center justify-center rounded-full text-ink-400 transition hover:bg-surface-2 hover:text-brand-1"
            >
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </Tooltip>
        </td>
        <td className="px-4 py-3">
          <p className="font-bold text-ink-900">{user.name}</p>
          <p className="text-[12px] text-ink-500">{user.email}</p>
        </td>
        <td className="px-4 py-3 text-right font-bold text-ink-900 tabular-nums">
          {formatMinutes(user.totalMinutes)}
        </td>
        <td className="px-4 py-3 text-right text-ink-700">{user.workDays}</td>
        <td className="px-4 py-3 text-right text-ink-700">{user.entryCount}</td>
        <td className="px-4 py-3" />
      </tr>

      {open && (
        <tr className="border-t border-line-soft bg-surface-2/30">
          <td />
          <td colSpan={5} className="px-4 py-4">
            {user.byDay.length === 0 ? (
              <p className="text-[13px] text-ink-500">Tidak ada catatan pada periode ini.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <SummaryList
                    title="Per Project"
                    rows={user.byProject.map((p) => ({ label: p.project, minutes: p.minutes }))}
                  />
                  <SummaryList
                    title="Per Jenis Pekerjaan"
                    rows={user.byWorkType.map((w) => ({ label: w.workType, minutes: w.minutes }))}
                  />
                </div>

                <div>
                  <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                    Rincian Harian
                  </p>
                  <div className="overflow-hidden rounded-md border border-line bg-surface">
                    {user.byDay.map((d) => (
                      <div key={d.date} className="border-b border-line-soft last:border-0">
                        <div className="flex items-center justify-between bg-surface-2/60 px-3 py-2">
                          <span className="text-[12.5px] font-bold text-ink-900">
                            {formatWIB(`${d.date}T00:00:00Z`, 'EEEE, dd MMM yyyy')}
                          </span>
                          <span className="text-[12.5px] font-bold text-brand-1 tabular-nums">
                            {formatMinutes(d.minutes)}
                          </span>
                        </div>
                        <ul className="divide-y divide-line-soft">
                          {d.entries.map((e) => (
                            <li key={e.id} className="flex items-start justify-between gap-3 px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-semibold text-ink-900">
                                  {e.taskTitle}
                                </p>
                                <p className="text-[11.5px] text-ink-500">
                                  {e.project} · {e.workType} · {e.requester}
                                </p>
                                {e.note && (
                                  <p className="mt-0.5 text-[11.5px] italic text-ink-400">{e.note}</p>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-[12.5px] font-bold text-ink-900 tabular-nums">
                                  {e.minutes}m
                                </p>
                                <p className="text-[11px] text-ink-400">
                                  {formatWIB(e.clockInAt, 'HH.mm')}–{formatWIB(e.clockOutAt, 'HH.mm')}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function SummaryList({
  title,
  rows,
}: {
  title: string
  rows: Array<{ label: string; minutes: number }>
}) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-400">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-400">—</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-line bg-surface">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between border-b border-line-soft px-3 py-2 last:border-0"
            >
              <span className="truncate text-[13px] text-ink-700">{r.label}</span>
              <span className="ml-3 shrink-0 text-[12.5px] font-bold text-ink-900 tabular-nums">
                {formatMinutes(r.minutes)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function UnlockSheet({
  lock,
  onClose,
  onDone,
  onError,
}: {
  lock: PeriodLockItem
  onClose: () => void
  onDone: () => Promise<void>
  onError: (msg: string) => void
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      await apiSend(`/api/period-locks/${lock.id}`, 'DELETE', { reason: reason.trim() })
      await onDone()
      onClose()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Gagal membuka kunci')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Buka Kunci Periode"
      description={periodLabel(lock.year, lock.month)}
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-pri-mediumbg px-3.5 py-3 text-[13px] font-semibold text-status-review">
          Membuka kunci membuat freelancer dapat mengubah jam kerja pada periode ini lagi. Alasan akan
          tercatat di activity log.
        </p>

        <div>
          <FieldLabel htmlFor="unlock-reason">Alasan membuka kunci</FieldLabel>
          <Textarea
            id="unlock-reason"
            required
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: ada koreksi jam yang belum disetujui sebelum dikunci"
          />
          <p className={`mt-1.5 text-[12px] font-semibold ${reason.trim().length < 5 ? 'text-ink-400' : 'text-pri-low'}`}>
            Minimal 5 karakter
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} loading={saving} disabled={reason.trim().length < 5}>
            Buka Kunci
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
