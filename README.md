# Kuro — Keep You Inline

Web app clock in/out yang **terikat ke task**, dengan task bucket, dashboard aktivitas admin, rekap jam bulanan (XLSX/PDF), dan alur koreksi time entry.

**Stack**: Next.js 14 (App Router, TypeScript) · Prisma + PostgreSQL 16 · Tailwind CSS · Nodemailer · SWR · MinIO (lampiran & banner)

---

## Status

| Fase | Isi                                                                                                            | Status     |
| ---- | -------------------------------------------------------------------------------------------------------------- | ---------- |
| 0    | Skema DB, auth (login/logout/reset, session 8j, RBAC), shell UI, Dockerfile                                    | ✅ Selesai |
| 1    | Masters & User (CRUD)                                                                                          | ✅ Selesai |
| 2    | Task bucket per-project (F1, F3)                                                                               | ✅ Selesai |
| 2b   | Requester + UX per-project + Sheet & sidebar collapsible                                                       | ✅ Selesai |
| 3    | Clock in/out/switch (F2) — widget timer, riwayat jam kerja                                                     | ✅ Selesai |
| 4    | Dashboard admin (F4) — live status, ringkasan, chart 30 hari, feed                                             | ✅ Selesai |
| 5    | Rekap + export XLSX/PDF + lock periode (F5)                                                                    | ✅ Selesai |
| 6    | Koreksi (F6)                                                                                                   | ✅ Selesai |
| 7    | Hardening & release                                                                                            | ⏳         |
| 7b   | Project lanjutan: banner (gambar/warna), requester per-project, assign freelancer, dropdown project di sidebar | ✅ Selesai |
| 7c   | Detail task (Sheet), lampiran task, lampiran clock out (MinIO)                                                 | ✅ Selesai |
| 7d   | Profil sendiri: foto profil (MinIO), username, nama lengkap, ganti password                                   | ✅ Selesai |
| 8    | Deploy Dokploy (Dockerfile + entrypoint migrasi/seed otomatis)                                                 | ✅ Selesai |

**Design system**: brand `#8B2FF2` (hover `#7A1FE0`), **button selalu solid (tanpa gradient)**, heading **DM Sans** + body **Figtree** (angka pakai `tabular-nums`), radius 8–22 + pill. Logo: glyph Kuro (`kara.svg`) dirender inline dengan `currentColor` (background transparan) di `src/components/brand.tsx` & `src/app/icon.svg` (favicon).

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

| Skrip                    | Fungsi                                             |
| ------------------------ | -------------------------------------------------- |
| `npm run dev`            | Development server                                 |
| `npm run build`          | `prisma generate` + production build (standalone)  |
| `npm run db:push`        | Sinkronkan skema Prisma ke DB                      |
| `npm run db:constraints` | Terapkan partial unique index (rule: 1 sesi aktif) |
| `npm run db:seed`        | Akun admin awal + master sample                    |
| `npm run storage:check`  | Uji koneksi MinIO & bucket banner                  |
| `npm run db:studio`      | Prisma Studio                                      |

## Deploy (Dokploy)

Aplikasi di-build dari `Dockerfile` (multi-stage, Next.js **standalone**, port **3000**). Container menjalankan `docker-entrypoint.sh` yang otomatis menyinkronkan skema sebelum server start.

**1. Siapkan database**

Buat **service PostgreSQL 16** di Dokploy (atau pakai yang sudah ada) → salin connection string.

**2. Buat aplikasi**

- Source: repo Git ini.
- Build: **Dockerfile**.
- Port: **3000**.
- Healthcheck: `GET /api/health` (mengembalikan `200` bila DB ok).

**3. Set environment** (panel Dokploy → Environment). Lihat `.env.example` untuk daftar lengkap.

| Variabel | Wajib | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Connection string Postgres. |
| `APP_URL` | ✅ | Domain publik, dipakai untuk link reset password. |
| `SESSION_SECRET` | ✅ | String acak panjang. |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | ✅ | Akun admin yang dibuat saat seed pertama. |
| `RUN_DB_PUSH` | — | Default `true`. Set `false` bila skema dikelola terpisah. |
| `RUN_DB_SEED` | — | Set `true` **hanya saat deploy pertama** (idempotent, aman dijalankan ulang). |
| `SMTP_*` | — | Bila kosong, email reset dicetak ke log server. |
| `MINIO_*` | — | Untuk lampiran & banner gambar. Tanpa ini, banner warna tetap jalan. |

**4. Deploy**

Deploy pertama kali: set `RUN_DB_SEED=true` agar admin + master sample dibuat, lalu kembalikan ke `false` pada deploy berikutnya. Entrypoint akan otomatis menjalankan `prisma db push` + `constraints.sql` tiap start (idempotent).

> Alternatif tanpa seed otomatis: jalankan manual sekali dari shell container (`prisma db push`, `prisma db execute`, `node prisma/seed.mjs`) atau dari lokal dengan `DATABASE_URL` produksi.

## Catatan teknis

- **Project lanjutan**: Project dikelola di `/admin/projects` (bukan Master Data) — mendukung **banner** (gambar unggahan ke MinIO **atau** background warna), **requester per-project** (banyak-pilih), **deskripsi**, aktif/nonaktif, dan **assign freelancer**. Freelancer hanya melihat project/task yang di-assign ke mereka.
- **Banner project**: mode gambar (`POST /api/uploads/project-banner` → MinIO, maks 2 MB, PNG/JPEG/WebP) atau warna HEX. Gambar ditampilkan via proxy `GET /api/projects/:id/banner` (cookie sesi ikut, object key tetap privat, cache immutable). Bila MinIO belum dikonfigurasi, mode warna tetap berfungsi dan unggah gambar menampilkan pesan jelas. Saat gambar diganti/dihapus, objek lama dibersihkan dari MinIO. Setup: `npm run storage:check`.
  - **Kuro mengakses MinIO dari sisi server**, bukan dari browser — jadi cukup endpoint yang bisa dijangkau server.
  - Bila MinIO di balik domain HTTPS (mis. `s3.notu.dev`): `MINIO_ENDPOINT=s3.notu.dev`, `MINIO_PORT=` (kosongkan), `MINIO_USE_SSL=true`. Port kosong otomatis jadi **443** (HTTPS) atau **9000** (HTTP).
  - Bila akses langsung tanpa TLS: `MINIO_ENDPOINT=<ip>`, `MINIO_PORT=9000`, `MINIO_USE_SSL=false`.
- **Dropdown project freelancer**: di sidebar, tepat di bawah logo Kuro. Project menjadi konteks kerja — project pertama dipilih otomatis dan pilihan disimpan di `localStorage` per user. Bila admin belum meng-assign freelancer ke project mana pun, muncul label **“Belum di-assign ke project”** dan Task Bucket memberi panduan, bukan papan kosong.
- **Master data**: **Jenis Pekerjaan** dan **Requester** (tambahan requester hanya Admin). **Project** dipindah ke halaman tersendiri.
- **Task per-project**: freelancer membuka `/bucket` yang **langsung menampilkan papan task (kanban) project yang sedang dipilih**; perpindahan project hanya lewat dropdown di sidebar (`ProjectSwitcher`) — tidak ada pemilih project di halaman lain. **Kartu task bisa digeser (drag & drop) antar kolom status** untuk memindahkan task miliknya (drag bawaan HTML5, tanpa dependensi tambahan); task yang sudah **Done** terkunci, dan task bukan miliknya hanya bisa dilihat. Admin tetap memakai daftar project di `/admin/tasks` lalu detail `/admin/tasks/[projectId]`. Statistik project dari `GET /api/projects/overview`. Form task hanya menawarkan requester yang terikat ke project tersebut.
- **Detail task**: tersedia Sheet detail (`TaskDetailSheet`) yang menampilkan project, jenis pekerjaan, requester, assignee, tenggat, progres waktu, deskripsi, dan lampiran. Data diambil dari `GET /api/tasks/:id` (admin bebas; freelancer hanya task dalam scope-nya). Dibuka dari kartu Task Bucket (klik judul / tombol **Detail**) dan tombol **Detail** di daftar task admin.
- **Lampiran**: task dan clock out dapat memiliki **lampiran berkas/gambar tanpa batas jumlah** (maks 25 MB per berkas). Berkas diunggah lebih dulu ke MinIO lewat `POST /api/uploads/attachment` (multipart `file`) yang mengembalikan metadata; metadata tersebut dikirim saat menyimpan task (`attachments` saat buat, `addAttachments`/`removeAttachmentIds` saat edit) atau clock out (`attachments` pada `/api/time-entries/clock-out`). Isi berkas **tidak pernah** diekspos langsung — diunduh lewat proxy `GET /api/attachments/:id` dengan kontrol akses (admin bebas; freelancer hanya lampiran task dalam scope-nya atau lampiran sesinya sendiri). Saat lampiran dihapus dari task, objek di MinIO ikut dibersihkan. Tanpa MinIO, unggah lampiran menampilkan pesan jelas dan fitur lain tetap berjalan.
- **Health check**: `GET /api/health` mengembalikan status DB (`200` bila ok, `503` bila gagal) — dipakai healthcheck Dokploy.
- **Transaksi**: transaksi interaktif Prisma memakai `TX_OPTIONS` (`src/lib/db.ts`, `maxWait` 15 dtk / `timeout` 30 dtk). Default Prisma hanya 5 dtk — terlalu ketat untuk database remote sehingga muncul `P2028 "Transaction not found"`.
- **Dialog**: semua memakai `Sheet` (`src/components/sheet.tsx`) — drawer dari kanan di desktop, bottom sheet di mobile.
- **Sidebar**: bisa di-collapse (rail 76px) dan preferensi disimpan di `localStorage`.
- **Waktu**: semua disimpan UTC, ditampilkan WIB (`Asia/Jakarta`) — helper di `src/lib/time.ts`.
- **Rekap & export**: rekap dihitung dari entry yang sudah clock out, dibulatkan ke bawah per menit; XLSX via ExcelJS (4 sheet), PDF via puppeteer-core. Di lokal, Chromium/Chrome/Edge dicari otomatis; di Docker sudah diarahkan ke chromium sistem (`PUPPETEER_EXECUTABLE_PATH`).
- **Koreksi (F6)**: freelancer mengajukan usulan perubahan jam/task pada sesinya; admin approve/reject dengan catatan. Saat approve, usulan divalidasi ulang (1 sesi aktif, periode terkunci, jam keluar > masuk, tidak tumpang tindih) sebelum diterapkan dalam transaksi. Admin juga bisa **edit langsung** time entry (Q5) — wajib alasan & ter-audit. Semua perubahan tercatat di activity log (nilai lama & baru).
- **Profil sendiri**: klik chip user di topbar → **Sheet Profil** untuk mengubah **foto profil** (unggah ke MinIO lewat `POST /api/uploads/avatar`, maks 2 MB, PNG/JPEG/WebP; ditampilkan via proxy `GET /api/users/:id/avatar`), **username** (unik, 3–30 huruf kecil/angka/`.`/`_`/`-`), dan **nama lengkap** via `PATCH /api/profile`. **Email tidak dapat diubah**. Ganti password lewat `POST /api/profile/password` (wajib password lama; sesi lain di-revoke, sesi saat ini dipertahankan). Semua perubahan tercatat di activity log. Bila MinIO belum dikonfigurasi, avatar memakai inisial dan unggah foto menampilkan pesan jelas.
- **Auth**: session cookie httpOnly (sliding 8 jam), token di DB berupa SHA-256 hash; reset password via token 1 jam sekali pakai; rate limit login & reset.
- **RBAC**: role dicek di API (`requireApiUser`) dan server layout (`/admin`), bukan hanya UI.
- **Audit**: semua aksi lewat `logActivity()` (`src/lib/activity.ts`) — tabel append-only.
- **Tanpa SMTP di dev**: email reset dicetak ke console server (`[mail:dev]`).
