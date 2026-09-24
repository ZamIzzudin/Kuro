// Kuro — rate limiter in-memory sederhana (single instance, cukup untuk v1)
// Catatan: pada deployment multi-instance, ganti backend dengan Redis.
const buckets = new Map<string, { count: number; resetAt: number }>()

/** Bersihkan bucket kedaluwarsa agar Map tidak tumbuh tanpa batas (dijalankan tiap 5 menit) */
const SWEEP_MS = 5 * 60_000
let lastSweep = Date.now()

function sweepExpired(now: number) {
  if (now - lastSweep < SWEEP_MS) return
  lastSweep = now
  for (const [key, bucket] of Array.from(buckets)) {
    if (bucket.resetAt < now) buckets.delete(key)
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
  const now = Date.now()
  sweepExpired(now)
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfter: 0 }
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) }
  }
  bucket.count += 1
  return { ok: true, retryAfter: 0 }
}

export function clientIp(req: Request): string {
  const h = req.headers
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}
