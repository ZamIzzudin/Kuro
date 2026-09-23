/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // exceljs & puppeteer-core dipakai hanya di server (export F5).
  // Dibuat external agar tidak di-bundle dan tetap tersedia di image standalone.
  experimental: {
    serverComponentsExternalPackages: ['exceljs', 'puppeteer-core'],
  },
}

export default nextConfig
