# Notu — Freelancer Time & Task Tracker

Web app clock in/out yang **terikat ke task**, dengan task bucket, dashboard aktivitas admin, rekap jam bulanan (XLSX/PDF), dan alur koreksi time entry.

- Rancangan lengkap: [`../RANCANGAN_PENGEMBANGAN.md`](../RANCANGAN_PENGEMBANGAN.md)
- Design system: Taskloop v1.0 (`../design-guideline.html`) — brand `#8B2FF2` (hover `#7A1FE0`), **button selalu solid (tanpa gradient)**, heading **DM Sans** + body **Figtree**, radius 8–22 + pill

**Stack**: Next.js 14 (App Router, TypeScript) · Prisma + PostgreSQL 16 · Tailwind CSS · Nodemailer · SWR

---

## Status

| Fase | Isi | Status |
|---|---|---|
| 0 | Skema DB, auth (login/logout/reset, session 8j, RBAC), shell UI, Dockerfile | ✅ Selesai |
| 1 | Masters & User (CRUD) | ✅ Selesai |
| 2 | Task bucket per-project (F1, F3) | ✅ Selesai |
| 2b | Requester + UX per-project + Sheet & sidebar collapsible | ✅ Selesai |
| 3 | Clock in/out/switch (F2) — widget timer, riwayat jam kerja | ✅ Selesai |
| 4 | Dashboard admin (F4) — live status, ringkasan, chart 30 hari, feed | ✅ Selesai |
| 5 | Rekap + export XLSX/PDF + lock periode (F5) | ✅ Selesai |
| 6 | Koreksi (F6) | ⏳ |
| 7 | Hardening & release | ⏳ |

## Setup development

```bash
# 1. Dependensi
npm install

# 2. Database Postgres lokal (Docker)
docker compose -f docker-compose.dev.yml up -d

# 3. Environment
cp .env.example .env   # sesuaikan bila perlu

# 4. Skema + constraint + seed awal
npm run db:push
npm run db:constraints   # partial unique index: 1 sesi aktif per user
npm run db:seed          # admin + master sample (+ SEED_DEMO=1 → freelancer demo)

# 5. Jalankan
npm run dev              # http://localhost:3000
```

Akun default (ubah via env sebelum seed): `admin@notu.local` / `admin12345` — ganti password setelah login pertama.

## Skrip penting

| Skrip | Fungsi |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` + production build (standalone) |
| `npm run db:push` | Sinkronkan skema Prisma ke DB |
| `npm run db:constraints` | Terapkan partial unique index (rule: 1 sesi aktif) |
| `npm run db:seed` | Akun admin awal + master sample |
| `npm run db:studio` | Prisma Studio |

## Deploy (Dokploy)

1. Buat **service Postgres** di Dokploy (atau pakai yang sudah ada) → salin connection string.
2. Buat aplikasi dari repo ini (build dari `Dockerfile`, port **3000**).
3. Set env vars di panel Dokploy: `DATABASE_URL`, `APP_URL`, `SESSION_SECRET`, `SMTP_*` (opsional), `INITIAL_ADMIN_*`.
4. Setelah deploy pertama, jalankan **sekali** dari terminal Dokploy (atau lokal dengan `DATABASE_URL` produksi):
   ```bash
   npx prisma db push
   npx prisma db execute --file ./prisma/constraints.sql --schema ./prisma/schema.prisma
   node prisma/seed.mjs   # butuh node_modules repo → jalankan dari repo lokal bila terminal Dokploy tidak memilikinya
   ```

## Catatan teknis

- **Master data**: **Project**, **Jenis Pekerjaan**, dan **Requester** (tambahan requester hanya Admin).
- **Task per-project**: `/bucket` & `/admin/tasks` menampilkan daftar project dulu, lalu detail di `/bucket/[projectId]` & `/admin/tasks/[projectId]`. Statistik project dari `GET /api/projects/overview`.
- **Dialog**: semua memakai `Sheet` (`src/components/sheet.tsx`) — drawer dari kanan di desktop, bottom sheet di mobile.
- **Sidebar**: bisa di-collapse (rail 76px) dan preferensi disimpan di `localStorage`.
- **Waktu**: semua disimpan UTC, ditampilkan WIB (`Asia/Jakarta`) — helper di `src/lib/time.ts`.
- **Rekap & export**: rekap dihitung dari entry yang sudah clock out, dibulatkan ke bawah per menit; XLSX via ExcelJS (4 sheet), PDF via puppeteer-core. Di lokal, Chromium/Chrome/Edge dicari otomatis; di Docker sudah diarahkan ke chromium sistem (`PUPPETEER_EXECUTABLE_PATH`).
- **Auth**: session cookie httpOnly (sliding 8 jam), token di DB berupa SHA-256 hash; reset password via token 1 jam sekali pakai; rate limit login & reset.
- **RBAC**: role dicek di API (`requireApiUser`) dan server layout (`/admin`), bukan hanya UI.
- **Audit**: semua aksi lewat `logActivity()` (`src/lib/activity.ts`) — tabel append-only.
- **Tanpa SMTP di dev**: email reset dicetak ke console server (`[mail:dev]`).
