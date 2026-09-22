// Notu — helper waktu (business rule #5: simpan UTC, tampil WIB)
import { id as idLocale } from 'date-fns/locale'
import { formatInTimeZone } from 'date-fns-tz'

export const TZ = 'Asia/Jakarta' // WIB

/** Format datetime lengkap dalam WIB, contoh: "22 Sep 2025 14.05" */
export function formatWIB(date: Date | string, fmt = 'dd MMM yyyy HH.mm'): string {
  return formatInTimeZone(new Date(date), TZ, fmt, { locale: idLocale })
}

/** Format tanggal saja dalam WIB, contoh: "22 Sep 2025" */
export function formatDateWIB(date: Date | string): string {
  return formatWIB(date, 'dd MMM yyyy')
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
