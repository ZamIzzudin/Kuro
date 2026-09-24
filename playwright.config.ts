import { defineConfig } from '@playwright/test'

// E2E Notu — dijalankan terhadap build produksi di port terpisah (default 3100)
// agar tidak bentrok dengan dev server.
// Memakai browser sistem (msedge/chrome) supaya tidak perlu mengunduh Chromium:
//   npm run build:e2e && npm run test:e2e
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.mjs',
  globalTeardown: './e2e/global-teardown.mjs',
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3100',
    channel: process.env.E2E_CHANNEL || 'msedge',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx next start -p 3100',
    url: 'http://localhost:3100/login',
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NEXT_DIST_DIR: '.next-e2e' },
  },
})
