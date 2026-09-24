/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'

/** Header keamanan (RANCANGAN §8). CSP dilonggarkan hanya di development. */
function securityHeaders() {
  // 'unsafe-inline' diperlukan karena Next menyuntikkan script/style inline.
  // 'unsafe-eval' hanya di dev (React refresh / source map).
  const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'"
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
    "connect-src 'self'",
  ].join('; ')

  const headers = [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ]
  // HSTS hanya relevan di belakang HTTPS (produksi)
  if (!isDev) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    })
  }
  return headers
}

const distDir = process.env.NEXT_DIST_DIR || '.next'

const nextConfig = {
  // distDir kustom dipakai untuk build uji/e2e agar tidak bentrok dengan dev server.
  // Pada distDir kustom, output standalone dimatikan (Next tidak mendukung kombinasinya).
  ...(distDir === '.next' ? { output: 'standalone' } : {}),
  distDir,
  reactStrictMode: true,
  poweredByHeader: false,
  // exceljs & puppeteer-core dipakai hanya di server (export F5).
  // Dibuat external agar tidak di-bundle dan tetap tersedia di image standalone.
  experimental: {
    serverComponentsExternalPackages: ['exceljs', 'puppeteer-core', 'minio'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }]
  },
}

export default nextConfig
