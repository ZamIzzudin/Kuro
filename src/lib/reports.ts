// Kuro — rekap jam kerja bulanan (Fase 5 / F5)
// Rule #4: hanya entry dengan clock_out terisi; durasi dibulatkan ke bawah (menit).
// Rule #5: pengelompokan hari memakai tanggal WIB; sesi dihitung pada tanggal clock in.
import { db } from './db'
import { formatInTimeZone } from 'date-fns-tz'
import { TZ, wibLocalToDate } from './time'
import type { Period } from './validators'

export type ReportEntry = {
  id: string
  taskId: string
  taskTitle: string
  project: string
  workType: string
  requester: string
  clockInAt: string
  clockOutAt: string
  minutes: number
  note: string | null
}

export type ReportByTask = {
  taskId: string
  title: string
  project: string
  workType: string
  requester: string
  minutes: number
  entryCount: number
  days: number
}

export type ReportByDay = {
  /** yyyy-MM-dd (WIB) */
  date: string
  minutes: number
  entryCount: number
  entries: ReportEntry[]
}

export type ReportUser = {
  id: string
  name: string
  email: string
  totalMinutes: number
  /** hari unik dengan entry (Q7) */
  workDays: number
  entryCount: number
  byTask: ReportByTask[]
  byProject: Array<{ project: string; minutes: number }>
  byWorkType: Array<{ workType: string; minutes: number }>
  byDay: ReportByDay[]
  /** daftar entry mentah (untuk detail export) */
  entries: ReportEntry[]
}

export type ReportResponse = {
  period: Period
  /** rentang tanggal WIB yang dicakup (yyyy-MM-dd) */
  range: { from: string; to: string }
  totalMinutes: number
  users: ReportUser[]
}

/** Batas awal & akhir bulan (WIB) sebagai Date UTC */
export function monthRange(year: number, month: number): { from: Date; to: Date; fromDate: string; toDate: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const fromDate = `${year}-${pad(month)}-01`
  const toDate = `${year}-${pad(month)}-${pad(lastDay)}`
  return {
    from: wibLocalToDate(`${fromDate}T00:00`),
    to: wibLocalToDate(`${toDate}T23:59`),
    fromDate,
    toDate,
  }
}

/** Tanggal WIB (yyyy-MM-dd) dari sebuah Date */
function wibDate(date: Date): string {
  return formatInTimeZone(date, TZ, 'yyyy-MM-dd')
}

/**
 * Rekap jam kerja bulanan per freelancer.
 * `userIds` kosong = semua freelancer aktif maupun nonaktif (admin sendiri dikecualikan).
 */
export async function getReportSummary(
  period: Period,
  userIds: string[] = []
): Promise<ReportResponse> {
  const { from, to, fromDate, toDate } = monthRange(period.year, period.month)

  const users = await db.user.findMany({
    where: {
      role: 'freelancer',
      ...(userIds.length > 0 ? { id: { in: userIds } } : {}),
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  const entries = await db.timeEntry.findMany({
    where: {
      userId: { in: users.map((u) => u.id) },
      clockOutAt: { not: null },
      clockInAt: { gte: from, lte: to },
    },
    include: {
      task: {
        include: {
          project: { select: { name: true } },
          workType: { select: { name: true } },
          requester: { select: { name: true } },
        },
      },
    },
    orderBy: { clockInAt: 'asc' },
  })

  const perUser = new Map<string, ReportUser>()
  for (const u of users) {
    perUser.set(u.id, {
      id: u.id,
      name: u.name,
      email: u.email,
      totalMinutes: 0,
      workDays: 0,
      entryCount: 0,
      byTask: [],
      byProject: [],
      byWorkType: [],
      byDay: [],
      entries: [],
    })
  }

  // Struktur agregasi sementara per user
  const taskMap = new Map<string, Map<string, ReportByTask>>()
  const projectMap = new Map<string, Map<string, number>>()
  const workTypeMap = new Map<string, Map<string, number>>()
  const dayMap = new Map<string, Map<string, ReportByDay>>()

  for (const e of entries) {
    const row = perUser.get(e.userId)
    if (!row || !e.clockOutAt) continue

    const minutes = Math.max(0, Math.floor((e.clockOutAt.getTime() - e.clockInAt.getTime()) / 60_000))
    const entry: ReportEntry = {
      id: e.id,
      taskId: e.taskId,
      taskTitle: e.task.title,
      project: e.task.project.name,
      workType: e.task.workType.name,
      requester: e.task.requester.name,
      clockInAt: e.clockInAt.toISOString(),
      clockOutAt: e.clockOutAt.toISOString(),
      minutes,
      note: e.note,
    }

    row.totalMinutes += minutes
    row.entryCount += 1
    row.entries.push(entry)

    const date = wibDate(e.clockInAt)

    // per task
    const tMap = taskMap.get(e.userId) ?? new Map<string, ReportByTask>()
    const tRow = tMap.get(e.taskId) ?? {
      taskId: e.taskId,
      title: e.task.title,
      project: e.task.project.name,
      workType: e.task.workType.name,
      requester: e.task.requester.name,
      minutes: 0,
      entryCount: 0,
      days: 0,
    }
    tRow.minutes += minutes
    tRow.entryCount += 1
    tMap.set(e.taskId, tRow)
    taskMap.set(e.userId, tMap)

    // per project
    const pMap = projectMap.get(e.userId) ?? new Map<string, number>()
    pMap.set(entry.project, (pMap.get(entry.project) ?? 0) + minutes)
    projectMap.set(e.userId, pMap)

    // per jenis pekerjaan
    const wMap = workTypeMap.get(e.userId) ?? new Map<string, number>()
    wMap.set(entry.workType, (wMap.get(entry.workType) ?? 0) + minutes)
    workTypeMap.set(e.userId, wMap)

    // per hari
    const dMap = dayMap.get(e.userId) ?? new Map<string, ReportByDay>()
    const dRow = dMap.get(date) ?? { date, minutes: 0, entryCount: 0, entries: [] }
    dRow.minutes += minutes
    dRow.entryCount += 1
    dRow.entries.push(entry)
    dMap.set(date, dRow)
    dayMap.set(e.userId, dMap)
  }

  let totalMinutes = 0
  const result: ReportUser[] = []

  for (const u of users) {
    const row = perUser.get(u.id)
    if (!row) continue

    const tMap = taskMap.get(u.id)
    row.byTask = tMap ? Array.from(tMap.values()).sort((a, b) => b.minutes - a.minutes) : []

    const dayRows = dayMap.get(u.id)
    row.byDay = dayRows ? Array.from(dayRows.values()).sort((a, b) => a.date.localeCompare(b.date)) : []
    row.workDays = row.byDay.length

    // tambahkan jumlah hari unik per task
    for (const t of row.byTask) {
      t.days = new Set(
        row.entries.filter((e) => e.taskId === t.taskId).map((e) => wibDate(new Date(e.clockInAt)))
      ).size
    }

    const pMap = projectMap.get(u.id)
    row.byProject = pMap
      ? Array.from(pMap.entries())
          .map(([project, minutes]) => ({ project, minutes }))
          .sort((a, b) => b.minutes - a.minutes)
      : []

    const wMap = workTypeMap.get(u.id)
    row.byWorkType = wMap
      ? Array.from(wMap.entries())
          .map(([workType, minutes]) => ({ workType, minutes }))
          .sort((a, b) => b.minutes - a.minutes)
      : []

    totalMinutes += row.totalMinutes
    // Saat menampilkan semua, sembunyikan freelancer tanpa catatan; bila dipilih eksplisit, tetap tampilkan.
    if (row.entryCount > 0 || userIds.length > 0) result.push(row)
  }

  return {
    period,
    range: { from: fromDate, to: toDate },
    totalMinutes,
    users: result,
  }
}

export type PeriodLockItem = {
  id: string
  year: number
  month: number
  note: string | null
  lockedAt: string
  lockedBy: { id: string; name: string }
}

export async function listPeriodLocks(): Promise<PeriodLockItem[]> {
  const locks = await db.periodLock.findMany({
    include: { lockedBy: { select: { id: true, name: true } } },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })
  return locks.map((l) => ({
    id: l.id,
    year: l.year,
    month: l.month,
    note: l.note,
    lockedAt: l.lockedAt.toISOString(),
    lockedBy: { id: l.lockedBy.id, name: l.lockedBy.name },
  }))
}
