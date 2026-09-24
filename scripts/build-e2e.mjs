// Notu — build produksi terisolasi untuk E2E.
// Memakai distDir khusus (.next-e2e) agar build tidak mengganggu dev server (.next).
// Jalankan: npm run build:e2e   →   npm run test:e2e
import { spawnSync } from 'node:child_process'

const env = { ...process.env, NEXT_DIST_DIR: '.next-e2e' }
const isWin = process.platform === 'win32'

const gen = spawnSync(isWin ? 'npx.cmd' : 'npx', ['prisma', 'generate'], { env, stdio: 'inherit' })
if (gen.status !== 0) process.exit(gen.status ?? 1)

const build = spawnSync(isWin ? 'npx.cmd' : 'npx', ['next', 'build'], { env, stdio: 'inherit' })
process.exit(build.status ?? 1)
