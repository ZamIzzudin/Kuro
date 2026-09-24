// Kuro — helper dashboard admin (Fase 4 / F4)
// Semua perhitungan waktu memakai batas hari/bulan WIB (rule #5: simpan UTC, tampil WIB).
import type { TaskStatus } from '@prisma/client'
import { formatInTimeZone } from 'date-fns-tz'
import { db } from './db'
import { TZ, dateToWibDate, wibLocalToDate } from './time'

/** Awal hari (00:00 WIB) untuk sebuah tanggal, dikembalikan sebagai Date UTC */
export function wibStartOfDay(date: Date = new Date()): Date {
  return wibLocalToDate(`${dateToWibDate(date)}T00:00`)
}

/** Awal bulan berjalan (WIB) sebagai Date UTC */
export function wibStartOfMonth(date: Date = new Date()): Date {
  return wibLocalToDate(`${formatInTimeZone(date, TZ, 'yyyy-MM')}-01T00:00`)
}

/** Awal hari N hari lalu (WIB) */
export function wibDaysAgo(days: number): Date {
  return wibStartOfDay(new Date(Date.now() - days * 86_400_000))
}

/** Kunci tanggal WIB (yyyy-MM-dd) dari sebuah Date */
function wibDayKey(date: Date): string {
  return formatInTimeZone(date, TZ, 'yyyy-MM-dd')
}

type RawEntry = { userId: string; clockInAt: Date; clockOutAt: Date | null }

/** Durasi menit sebuah entry; sesi berjalan dihitung sampai `now` */
function entryMinutes(e: RawEntry, now: Date): number {
  const end = e.clockOutAt ?? now
  return Math.max(0, Math.floor((end.getTime() - e.clockInAt.getTime()) / 60_000))
}

export type LiveSession = {
  id: string
  user: { id: string; name: string }
  task: { id: string; title: string; project: string; workType: string }
  clockInAt: string
  runningMinutes: number
}

/** Daftar sesi yang sedang berjalan (siapa clock in, task apa, sudah berapa lama) */
export async function getLiveSessions(): Promise<LiveSession[]> {
  const entries = await db.timeEntry.findMany({
    where: { clockOutAt: null },
    include: {
      user: { select: { id: true, name: true } },
      task: {
        include: {
          project: { select: { name: true } },
          workType: { select: { name: true } },
        },
      },
    },
    orderBy: { clockInAt: 'asc' },
  })

  const now = new Date()
  return entries.map((e) => ({
    id: e.id,
    user: { id: e.user.id, name: e.user.name },
    task: {
      id: e.task.id,
      title: e.task.title,
      project: e.task.project.name,
      workType: e.task.workType.name,
    },
    clockInAt: e.clockInAt.toISOString(),
    runningMinutes: entryMinutes(e, now),
  }))
}

export type DashboardSummary = {
  totals: { today: number; week: number; month: number }
  perUser: Array<{ id: string; name: string; today: number; week: number; month: number }>
  tasksByStatus: Record<TaskStatus, number>
  totalTasks: number
  overdue: Array<{
    id: string
    title: string
    project: string
    assignee: string | null
    deadlineAt: string
  }>
}

const EMPTY_STATUS: Record<TaskStatus, number> = {
  todo: 0,
  in_progress: 0,
  review: 0,
  done: 0,
  cancelled: 0,
}

/** Ringkasan: total jam hari/minggu/bulan + task per status + daftar overdue */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const now = new Date()
  const dayStart = wibStartOfDay(now)
  const weekStart = wibDaysAgo(6)
  const monthStart = wibStartOfMonth(now)
  const queryFrom = weekStart < monthStart ? weekStart : monthStart

  const [entries, statusGroups, overdueTasks] = await Promise.all([
    db.timeEntry.findMany({
      where: { clockInAt: { gte: queryFrom } },
      select: {
        userId: true,
        clockInAt: true,
        clockOutAt: true,
        user: { select: { id: true, name: true } },
      },
    }),
    db.task.groupBy({ by: ['status'], _count: { _all: true } }),
    db.task.findMany({
      where: {
        deadlineAt: { lt: now },
        status: { notIn: ['done', 'cancelled'] },
      },
      include: {
        project: { select: { name: true } },
        assignee: { select: { name: true } },
      },
      orderBy: { deadlineAt: 'asc' },
      take: 12,
    }),
  ])

  const perUserMap = new Map<string, { id: string; name: string; today: number; week: number; month: number }>()
  let today = 0
  let week = 0
  let month = 0

  for (const e of entries) {
    const minutes = entryMinutes(e, now)
    const inToday = e.clockInAt >= dayStart
    const inWeek = e.clockInAt >= weekStart
    const inMonth = e.clockInAt >= monthStart

    if (inMonth) month += minutes
    if (inWeek) week += minutes
    if (inToday) today += minutes

    const row = perUserMap.get(e.userId) ?? {
      id: e.user.id,
      name: e.user.name,
      today: 0,
      week: 0,
      month: 0,
    }
    if (inMonth) row.month += minutes
    if (inWeek) row.week += minutes
    if (inToday) row.today += minutes
    perUserMap.set(e.userId, row)
  }

  const tasksByStatus = { ...EMPTY_STATUS }
  let totalTasks = 0
  for (const g of statusGroups) {
    tasksByStatus[g.status] = g._count._all
    totalTasks += g._count._all
  }

  const perUser = Array.from(perUserMap.values()).sort((a, b) => b.month - a.month)

  return {
    totals: { today, week, month },
    perUser,
    tasksByStatus,
    totalTasks,
    overdue: overdueTasks.map((t) => ({
      id: t.id,
      title: t.title,
      project: t.project.name,
      assignee: t.assignee?.name ?? null,
      deadlineAt: t.deadlineAt.toISOString(),
    })),
  }
}

export type ChartResponse = {
  days: string[]
  series: Array<{ userId: string; name: string; totals: number[] }>
}

/** Jam kerja harian per user untuk `days` hari terakhir (default 30) */
export async function getWorkChart(days = 30): Promise<ChartResponse> {
  const total = Math.min(60, Math.max(7, days))
  const now = new Date()
  const start = wibDaysAgo(total - 1)

  const dayKeys: string[] = []
  for (let i = 0; i < total; i++) {
    dayKeys.push(wibDayKey(new Date(start.getTime() + i * 86_400_000)))
  }
  const index = new Map(dayKeys.map((k, i) => [k, i]))

  const entries = await db.timeEntry.findMany({
    where: { clockInAt: { gte: start } },
    select: {
      userId: true,
      clockInAt: true,
      clockOutAt: true,
      user: { select: { id: true, name: true } },
    },
  })

  const seriesMap = new Map<string, { userId: string; name: string; totals: number[] }>()

  for (const e of entries) {
    const key = wibDayKey(e.clockInAt)
    const i = index.get(key)
    if (i === undefined) continue

    let row = seriesMap.get(e.userId)
    if (!row) {
      row = { userId: e.user.id, name: e.user.name, totals: Array.from({ length: total }, () => 0) }
      seriesMap.set(e.userId, row)
    }
    row.totals[i] += entryMinutes(e, now)
  }

  return { days: dayKeys, series: Array.from(seriesMap.values()) }
}

export type FeedItem = {
  id: string
  action: string
  description: string
  user: { id: string; name: string } | null
  createdAt: string
}

/** Activity feed terpaginasi (cursor = id log terakhir) */
export async function getActivityFeed(
  cursor?: string | null,
  take = 20
): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  const rows = await db.activityLog.findMany({
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  const hasMore = rows.length > take
  const page = hasMore ? rows.slice(0, take) : rows

  return {
    items: page.map((r) => ({
      id: r.id,
      action: r.action,
      description: r.description,
      user: r.user ? { id: r.user.id, name: r.user.name } : null,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  }
}
