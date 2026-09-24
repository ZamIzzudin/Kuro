// Notu — unit test helper waktu (business rule #4 pembulatan & #5 WIB↔UTC)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MONTH_NAMES,
  dateOnlyUTC,
  durationMinutes,
  formatMinutes,
  formatTimer,
  periodLabel,
  wibLocalToDate,
  wibYearMonth,
} from '../src/lib/time.ts'

test('formatMinutes memformat jam & menit', () => {
  assert.equal(formatMinutes(0), '0m')
  assert.equal(formatMinutes(45), '45m')
  assert.equal(formatMinutes(60), '1j')
  assert.equal(formatMinutes(90), '1j 30m')
  assert.equal(formatMinutes(605), '10j 5m')
})

test('formatTimer menghasilkan HH:MM:SS', () => {
  assert.equal(formatTimer(0), '00:00:00')
  assert.equal(formatTimer(59), '00:00:59')
  assert.equal(formatTimer(3600), '01:00:00')
  assert.equal(formatTimer(3661), '01:01:01')
  assert.equal(formatTimer(-5), '00:00:00')
})

test('durationMinutes dibulatkan ke bawah (rule #4)', () => {
  const from = new Date('2026-09-01T01:00:00Z')
  // 1 menit 59 detik → 1 menit
  assert.equal(durationMinutes(from, new Date('2026-09-01T01:01:59Z')), 1)
  assert.equal(durationMinutes(from, new Date('2026-09-01T02:30:00Z')), 90)
  // negatif dijepit ke 0
  assert.equal(durationMinutes(from, new Date('2026-09-01T00:00:00Z')), 0)
})

test('wibYearMonth memakai zona Asia/Jakarta', () => {
  // 31 Des 2026 23.30 WIB = 16.30Z (masih Desember)
  assert.deepEqual(wibYearMonth(new Date('2026-12-31T16:30:00Z')), { year: 2026, month: 12 })
  // 1 Jan 2026 00.30 WIB = 31 Des 2025 17.30Z → harus Januari
  assert.deepEqual(wibYearMonth(new Date('2025-12-31T17:30:00Z')), { year: 2026, month: 1 })
})

test('wibLocalToDate mengubah input WIB → UTC (rule #5)', () => {
  assert.equal(wibLocalToDate('2026-09-01T08:00').toISOString(), '2026-09-01T01:00:00.000Z')
  assert.equal(wibLocalToDate('2026-09-01T17:30').toISOString(), '2026-09-01T10:30:00.000Z')
})

test('dateOnlyUTC menyimpan tanggal sebagai UTC midnight', () => {
  assert.equal(dateOnlyUTC('2026-09-15').toISOString(), '2026-09-15T00:00:00.000Z')
})

test('periodLabel memakai nama bulan Indonesia', () => {
  assert.equal(MONTH_NAMES.length, 12)
  assert.equal(periodLabel(2026, 1), 'Januari 2026')
  assert.equal(periodLabel(2026, 12), 'Desember 2026')
})
