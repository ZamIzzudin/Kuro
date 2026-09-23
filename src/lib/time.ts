// Notu — helper waktu (business rule #5: simpan UTC, tampil WIB)
import { id as idLocale } from 'date-fns/locale'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export const TZ = 'Asia/Jakarta' // WIB

/** Format datetime lengkap dalam WIB, contoh: "22 Sep 2025 14.05" */
export function formatWIB(date: Date | string, fmt = 'dd MMM yyyy HH.mm'): string {
  return formatInTimeZone(new Date(date), TZ, fmt, { locale: idLocale })
}

/** Format tanggal saja dalam WIB, contoh: "22 Sep 2025" */
export function formatDateWIB(date: Date | string): string {
  return formatWIB(date, 'dd MMM yyyy')
}

/** Format tanggal pendek, contoh: "22 Sep" */
export function formatDateShortWIB(date: Date | string): string {
  return formatWIB(date, 'dd MMM')
}

/** Input datetime-local (WIB) → Date UTC untuk disimpan (rule #5) */
export function wibLocalToDate(local: string): Date {
  return fromZonedTime(local, TZ)
}

/** Date → string datetime-local (WIB) untuk prefill form */
export function dateToWibLocal(date: Date | string): string {
  return formatInTimeZone(new Date(date), TZ, "yyyy-MM-dd'T'HH:mm")
}

/** Date → string tanggal (yyyy-MM-dd) WIB untuk input date / kolom @db.Date */
export function dateToWibDate(date: Date | string): string {
  return formatInTimeZone(new Date(date), TZ, 'yyyy-MM-dd')
}

/** Tanggal hari ini (WIB) sebagai yyyy-MM-dd */
export function todayWibDate(): string {
  return dateToWibDate(new Date())
}

/** Tanggal yyyy-MM-dd → Date pukul 00:00 UTC (untuk kolom @db.Date) */
export function dateOnlyUTC(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`)
}

/** Durasi dalam menit (dibulatkan ke bawah, rule #4) */
export function durationMinutes(from: Date | string, to: Date | string): number {
  return Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 60_000))
}

/** Format menit → "2j 35m" */
export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}j`
  return `${h}j ${m}m`
}

/** Detik → "HH:MM:SS" untuk timer berjalan */
export function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}

/** Tahun & bulan (WIB) dari sebuah tanggal — untuk cek period lock */
export function wibYearMonth(date: Date | string): { year: number; month: number } {
  const [y, m] = formatInTimeZone(new Date(date), TZ, 'yyyy-MM').split('-')
  return { year: Number(y), month: Number(m) }
}
