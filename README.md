# Kuro — Keep You Inline

Web app clock in/out yang **terikat ke task**, dengan task bucket, dashboard aktivitas admin, rekap jam bulanan (XLSX/PDF), dan alur koreksi time entry.

**Stack**: Next.js 14 (App Router, TypeScript) · Prisma + PostgreSQL 16 · Tailwind CSS · Nodemailer · SWR · MinIO (lampiran & banner)

---

## Status

| Fase | Isi                                                                                                            | Status     |
| ---- | -------------------------------------------------------------------------------------------------------------- | ---------- |
| 0    | Skema DB, auth (login/logout/reset, session 8j, RBAC), shell UI, Dockerfile                                    | ✅ Selesai |
| 1    | Masters & User (CRUD)                                                                                          | ✅ Selesai |
| 2    | Hierarki Sprint → Task → Subtask (kanban Subtask per-project)                                                   | ✅ Selesai |
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
| 9    | Redesain hierarki: **Project → Sprint → Task → Subtask** (multi-assignee, Markdown, Backlog)                    | ✅ Selesai |
| 10   | **Revisi** in-place: task dikembalikan ke status `revision` (tanpa task baru), subtask terpilih bisa diambil ulang          | ✅ Selesai |

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

### Bulk import task dari Excel

Fitur unggah massal **sengaja tidak dibuat di platform**. Cukup pakai Excel + skrip:

```bash
npm run template:tasks                 # buat templates/Template-Bulk-Task.xlsx
# ... isi lembar "Task" ...
npm run import:tasks -- "templates/Template-Bulk-Task.xlsx"          # validasi (dry-run)
npm run import:tasks -- "templates/Template-Bulk-Task.xlsx" --yes    # tulis ke database
```

Kolom: Judul*, Deskripsi, Project*, Jenis Pekerjaan*, Requester*, Assignee, Prioritas, Estimasi (jam), Tanggal Request*, Deadline (tanggal)*, Jam Deadline, Status. Tanda `*` wajib. Assignee kosong = bucket bersama. Format tanggal `YYYY-MM-DD`, jam `HH:MM` (WIB). Bila ada baris tidak valid, skrip menampilkan nomor baris & alasannya dan **tidak menulis apa pun**.

### Suntik data lama (backdate) — jam kerja

Untuk mengisi jam kerja historis agar rekap menampilkan data sebelum aplikasi dipakai:

```bash
npm run template:time-entries          # buat templates/Template-Bulk-TimeEntry.xlsx
# ... isi lembar "TimeEntry" ...
npm run import:time-entries -- "templates/Template-Bulk-TimeEntry.xlsx"        # validasi
npm run import:time-entries -- "templates/Template-Bulk-TimeEntry.xlsx" --yes  # tulis
```

Kolom: Freelancer*, Project*, Judul Task*, Tanggal Masuk*, Jam Masuk*, Tanggal Keluar, Jam Keluar*, Catatan. `Tanggal Keluar` hanya diisi bila sesi melewati tengah malam. Task **tidak diubah** (boleh sudah Done) — hanya time entry yang ditambahkan, sehingga langsung terhitung di rekap bulanan. Importer memvalidasi: task cocok dengan project, jam keluar > masuk, **tanpa tumpang tindih** sesi per freelancer (termasuk antar baris & dengan data lama), dan **menghormati period lock**. Baris identik dengan sesi yang sudah ada otomatis dilewati. Sheet **Daftar Task** memuat ID/judul/project/status semua task sebagai acuan.

### Suntik data lama — task baru + jam kerja sekaligus (backfill)

Untuk data lama yang **task-nya belum ada** di sistem, pakai template gabungan: satu baris membuat task **sekaligus** sesi kerjanya.

```bash
npm run template:backfill              # buat templates/Template-Bulk-Backfill.xlsx
npm run import:backfill -- "templates/Template-Bulk-Backfill.xlsx"        # validasi
npm run import:backfill -- "templates/Template-Bulk-Backfill.xlsx" --yes  # tulis
```

Kolom (hijau = data task, ungu = data waktu): Freelancer*, Project*, Judul Task*, Deskripsi Task, Jenis Pekerjaan*, Requester*, Prioritas, Estimasi (jam), Tanggal Request, Deadline (tanggal), Jam Deadline, Status Task, Tanggal Masuk*, Jam Masuk*, Tanggal Keluar, Jam Keluar*, Catatan Kerja.

- **Pengelompokan task**: task dibuat dari **baris pertama** untuk tiap pasangan (Project + Judul Task). Baris berikutnya cukup mengulang judulnya (kolom data task boleh dikosongkan) — hanya menambah sesi. Task ini di-**assign** ke freelancer baris pertama.
- **Task yang sudah ada** (project + judul sama) otomatis **dipakai ulang** dan **tidak diubah** — hanya sesi yang ditambahkan.
- Default `Status Task` = `done` (karena data lama), `Tanggal Request` = Tanggal Masuk, dan `Deadline` = Tanggal Request + 7 hari bila dikosongkan.
- Validasi sama dengan importer time entry (tanpa tumpang tindih, period lock) plus validasi kolom task; **atomik** (ada 1 error → tidak ada yang ditulis) dan **idempoten** (sesi duplikat dilewati).

**4. Deploy**

Deploy pertama kali: set `RUN_DB_SEED=true` agar admin + master sample dibuat, lalu kembalikan ke `false` pada deploy berikutnya. Entrypoint akan otomatis menjalankan `prisma db push` + `constraints.sql` tiap start (idempotent).

> Alternatif tanpa seed otomatis: jalankan manual sekali dari shell container (`prisma db push`, `prisma db execute`, `node prisma/seed.mjs`) atau dari lokal dengan `DATABASE_URL` produksi.

## Catatan teknis

- **Hierarki**: **Project → Sprint → Task → Subtask**. **Sprint** adalah *timebox* per project (maksimal **satu sprint aktif** per project, dijaga partial unique index `sprints_one_active_per_project`); task di luar sprint = **Backlog**. **Task** adalah unit “cerita” (metadata bisnis, brief, pool assignee banyak). **Subtask** adalah unit kerja terdalam — di sinilah freelancer **clock in/out**. Setiap task wajib punya minimal satu subtask.
- **Rollup status**: status **task induk otomatis mengikuti subtask** (satu arah: subtask → task) — ada subtask `revision` → task `revision`; semua subtask `done` → task `done`; sisa subtask semuanya `review` → task `review`; ada `in_progress` → task `in_progress`; selain itu `todo` (task hanya `todo` bila **seluruh** subtask `todo`). Saat task menjadi `done`, keanggotaan sprint ditutup. Task `done` bersifat terminal kecuali dibuka lewat **Minta Revisi**. Modul: `src/lib/task-rollup.ts` (aturan murni) + `src/lib/task-status.ts` (penerapan).
- **Sprint**: dikelola di `/admin/sprints` (pilih project; juga bisa dibuka dari `Kelola Sprint` di daftar task project). Siklus status `planned → active → completed`; sprint `completed` bisa dibuka kembali (`planned`). **Task baru SELALU lahir di Backlog** — form Buat/Edit Task tidak lagi punya pemilih Sprint; task dimasukkan ke sprint lewat tombol **Kelola Task** pada kartu sprint (`POST /api/sprints/:id/tasks`), baik sprint masih `planned` maupun `active`. Saat sprint ditutup, admin **memilih** task belum selesai (`todo`/`in_progress`/`revision`) yang dipindah ke **sprint berikutnya yang sudah ada**; task `review` dan `done` **tetap di sprint lama**; sisa task belum selesai dikembalikan ke Backlog. Riwayat keanggotaan disimpan permanen di tabel **TaskSprintHistory** (bukan hanya ActivityLog). **Sprint Goal** opsional dan mendukung Markdown.
- **Alert deadline tugas vs sprint**: task yang `deadlineAt` melewati `endDate` sprint diberi peringatan (`beyondSprint`) — hanya peringatan, tidak memblokir penyimpanan.
- **Markdown**: deskripsi Sprint/Task/Subtask dan Sprint Goal disimpan sebagai Markdown mentah (batas 20.000 karakter) dan dirender dengan `react-markdown` + `remark-gfm` + **`rehype-sanitize`** (sanitasi XSS wajib). Editor `MarkdownEditor` menyediakan tab **Tulis/Pratinjau**.
- **Fokus clock in**: freelancer hanya boleh mengerjakan **satu subtask** pada satu waktu (rule #2: satu sesi aktif) dan hanya subtask di **sprint aktif** (Backlog bersifat read-only sampai masuk sprint). Subtask tanpa assignee bisa diklaim (bucket bersama); saat clock in, subtask otomatis menjadi miliknya dan statusnya `todo`/`revision` → `in_progress`.
- **Rollup status**: saat clock out, status subtask diperbarui; status **task** di-rollup dari subtask. Status task `done` bersifat terminal — hanya bisa dibuka kembali lewat aksi Minta Revisi. Task `review` yang berada di sprint yang sudah `completed` hanya dapat dinaikkan menjadi `done`.
- **Revisi task (in-place)**: aksi **Minta Revisi** (`POST /api/tasks/[id]/revisions`) **tidak** membuat task baru. Task yang sama dikembalikan ke status **`revision`** dan **tetap berada di sprint yang sama**. Pemilih melaporkan subtask mana yang perlu dikerjakan ulang (`subtaskIds[]`) plus catatan alasan (`revisionNote`). Subtask terpilih dikembalikan ke status `revision` sehingga **muncul kembali di bucket freelancer** dan bisa dikerjakan ulang (clock in dari `revision` → `in_progress`). Bila task tadinya `done` dan keanggotaan sprint-nya sudah ditutup, keanggotaan dibuka kembali. Aksi ini bisa dilakukan admin, Project Manager, maupun freelancer.
- **Dua konsep filter**: di Task Bucket freelancer tersedia pilihan **Sprint Aktif** (default) dan **Backlog**; filter API memakai `sprintId=active|backlog|<id>`.
- **Project lanjutan**: Project dikelola di `/admin/projects` (bukan Master Data) — mendukung **banner** (gambar unggahan ke MinIO **atau** background warna), **requester per-project** (banyak-pilih), **deskripsi**, aktif/nonaktif, **assign freelancer**, **donut status task**, dan **hapus project**. Freelancer hanya melihat project/task yang di-assign ke mereka.
- **Hapus project** (`DELETE /api/projects/:id`, admin): wajib mengetikkan **nama project persis** sebagai konfirmasi. Karena skema tidak memakai `onDelete: cascade` pada relasi Task/TimeEntry/Correction, penghapusan dibersihkan berurutan di dalam satu transaksi (koreksi → time entry → subtask → task → sprint → project) dan objek MinIO (banner + seluruh lampiran) dihapus setelahnya. Ter-audit sebagai `project_deleted`.
- **Deadline dekat**: card project di `/admin/tasks` menampilkan badge **“deadline ≤ 1 minggu”** — jumlah task belum selesai yang tenggatnya dalam 7 hari ke depan (di luar yang sudah overdue), dari `dueSoon` pada `GET /api/projects/overview`.
- **Bulk import task (tanpa fitur di platform)**: hanya berupa berkas Excel di `templates/`.
  - `npm run template:tasks` → membuat `templates/Template-Bulk-Task.xlsx` (isinya membaca project/jenis pekerjaan/requester/freelancer aktif saat itu, jadi selalu sinkron). Lembar: **Task** (diisi, header baris 3, data mulai baris 4, ada dropdown), **Contoh**, **Referensi** (sumber dropdown), **Petunjuk**.
  - `npm run import:tasks -- "templates/Template-Bulk-Task.xlsx"` → **dry-run** (validasi saja, tidak menulis). Tambahkan `--yes` untuk menulis (transaksi atomik — bila ada 1 baris tidak valid, tidak ada yang tersimpan). Referensi dicocokkan berdasarkan **nama**; tanggal/jam dianggap **WIB**.
- **Banner project**: mode gambar (`POST /api/uploads/project-banner` → MinIO, maks 2 MB, PNG/JPEG/WebP) atau warna HEX. Gambar ditampilkan via proxy `GET /api/projects/:id/banner` (cookie sesi ikut, object key tetap privat, cache immutable). Bila MinIO belum dikonfigurasi, mode warna tetap berfungsi dan unggah gambar menampilkan pesan jelas. Saat gambar diganti/dihapus, objek lama dibersihkan dari MinIO. Setup: `npm run storage:check`.
  - **Kuro mengakses MinIO dari sisi server**, bukan dari browser — jadi cukup endpoint yang bisa dijangkau server.
  - Bila MinIO di balik domain HTTPS (mis. `s3.notu.dev`): `MINIO_ENDPOINT=s3.notu.dev`, `MINIO_PORT=` (kosongkan), `MINIO_USE_SSL=true`. Port kosong otomatis jadi **443** (HTTPS) atau **9000** (HTTP).
  - Bila akses langsung tanpa TLS: `MINIO_ENDPOINT=<ip>`, `MINIO_PORT=9000`, `MINIO_USE_SSL=false`.
- **Dropdown project freelancer**: di sidebar, tepat di bawah logo Kuro. Project menjadi konteks kerja — project pertama dipilih otomatis dan pilihan disimpan di `localStorage` per user. Bila admin belum meng-assign freelancer ke project mana pun, muncul label **“Belum di-assign ke project”** dan Task Bucket memberi panduan, bukan papan kosong.
- **Master data**: **Jenis Pekerjaan** dan **Requester** (dikelola Admin & Project Manager). **Project** dipindah ke halaman tersendiri.
- **Task per-project**: freelancer membuka `/bucket` yang **langsung menampilkan papan kanban SUBTASK project yang sedang dipilih** (satu kartu = satu subtask), dengan filter **Sprint Aktif / Backlog**; perpindahan project hanya lewat dropdown di sidebar (`ProjectSwitcher`). Kartu bucket **hanya berisi subtask dalam jangkauan freelancer** — miliknya sendiri atau subtask tanpa assignee yang bisa ia ambil (bucket bersama); subtask milik freelancer lain tidak pernah ditampilkan. **Kartu subtask bisa digeser (drag & drop) antar kolom status** (drag bawaan HTML5, tanpa dependensi tambahan) — hanya untuk subtask di sprint aktif yang belum selesai dan miliknya/bisa diklaim. Admin/Project Manager memakai daftar project di `/admin/tasks` lalu detail `/admin/tasks/[projectId]` dengan **toggle Tabel / Kanban**: papan kanban menampilkan **TASK INDUK** (bukan subtask) dan kartunya bisa digeser untuk mengubah status task. Statistik project dari `GET /api/projects/overview`.
- **Multi-assignee**: satu Task bisa di-assign ke beberapa freelancer (`TaskAssignee`). Assignee subtask harus termasuk dalam pool assignee task; subtask tanpa assignee bisa diklaim siapa pun di project (bucket bersama).
- **Detail**: `TaskDetailSheet` (`GET /api/tasks/:id`) menampilkan info task + brief + daftar subtask — di sini admin/PM dapat **mengubah status tiap subtask** dan memakai aksi **Minta Revisi** (pilih subtask → status `revision`); `SubtaskDetailSheet` (`GET /api/subtasks/:id`) menampilkan info task induk, assignee, deskripsi Markdown, progres waktu, dan lampiran subtask.
- **Lampiran**: **TaskAttachment** = brief/referensi (diunggah admin saat membuat/mengubah task); **SubtaskAttachment** = hasil kerja (atau lampiran saat clock out); **TimeEntryAttachment** = berkas sesi. Semua **tanpa batas jumlah** (maks 25 MB per berkas). Berkas diunggah lebih dulu ke MinIO lewat `POST /api/uploads/attachment` (multipart `file`) yang mengembalikan metadata; metadata tersebut dikirim saat menyimpan subtask (`addAttachments`/`removeAttachmentIds` pada `PATCH /api/subtasks/:id`) atau clock out (`attachments` pada `/api/time-entries/clock-out`). Isi berkas **tidak pernah** diekspos langsung — diunduh lewat proxy `GET /api/attachments/:id` dengan kontrol akses (admin bebas; freelancer hanya lampiran dalam scope-nya atau lampiran sesinya sendiri). Saat lampiran dihapus, objek di MinIO ikut dibersihkan. Tanpa MinIO, unggah lampiran menampilkan pesan jelas dan fitur lain tetap berjalan.
- **Health check**: `GET /api/health` mengembalikan status DB (`200` bila ok, `503` bila gagal) — dipakai healthcheck Dokploy.
- **Transaksi**: transaksi interaktif Prisma memakai `TX_OPTIONS` (`src/lib/db.ts`, `maxWait` 15 dtk / `timeout` 30 dtk). Default Prisma hanya 5 dtk — terlalu ketat untuk database remote sehingga muncul `P2028 "Transaction not found"`.
- **Dialog**: semua memakai `Sheet` (`src/components/sheet.tsx`) — drawer dari kanan di desktop, bottom sheet di mobile.
- **Logout freelancer**: bila masih ada sesi berjalan, menekan **Logout** akan membuka Sheet **“Clock Out Dulu”** (catatan ≥10 karakter + status subtask + lampiran) dengan tombol **Clock Out & Logout**; tersedia juga **Logout tanpa clock out** dan **Batal**. Ini mencegah sesi menggantung saat freelancer meninggalkan aplikasi. Sheet clock out yang sama (`src/components/clock-out-sheet.tsx`) dipakai di Home dan logout.
- **Sidebar**: bisa di-collapse (rail 76px) dan preferensi disimpan di `localStorage`.
- **Waktu**: semua disimpan UTC, ditampilkan WIB (`Asia/Jakarta`) — helper di `src/lib/time.ts`.
- **Rekap & export**: rekap dihitung dari entry yang sudah clock out, dibulatkan ke bawah per menit; XLSX via ExcelJS (4 sheet), PDF via puppeteer-core. Di lokal, Chromium/Chrome/Edge dicari otomatis; di Docker sudah diarahkan ke chromium sistem (`PUPPETEER_EXECUTABLE_PATH`).
- **RBAC**: role dicek di API (`requireApiUser`) dan server layout (`/admin`), bukan hanya UI. Tiga role:
  - **Admin** — akses penuh (semua halaman admin).
  - **Project Manager** — mengelola **Project, Sprint, Task, dan Master Data**; **tanpa** User, Rekap & Export, dan Review Koreksi (dashboard tetap bisa dibuka).
  - **Freelancer** — area kerja sendiri (`/home`, `/bucket`, `/my-time`, `/corrections`).
  - Pengecekan area `/admin` memakai `hasAdminAccess()` (`src/lib/roles.ts`); halaman eksklusif Admin (`/admin/users`, `/admin/reports`, `/admin/corrections`) dijaga ulang di level halaman + API.
- **Koreksi (F6)**: freelancer mengajukan usulan perubahan jam/task pada sesinya; admin approve/reject dengan catatan. Saat approve, usulan divalidasi ulang (1 sesi aktif, periode terkunci, jam keluar > masuk, tidak tumpang tindih) sebelum diterapkan dalam transaksi. Admin juga bisa **edit langsung** time entry (Q5) — wajib alasan & ter-audit. Semua perubahan tercatat di activity log (nilai lama & baru).
- **Profil sendiri**: klik chip user di topbar → **Sheet Profil** untuk mengubah **foto profil** (unggah ke MinIO lewat `POST /api/uploads/avatar`, maks 2 MB, PNG/JPEG/WebP; ditampilkan via proxy `GET /api/users/:id/avatar`), **username** (unik, 3–30 huruf kecil/angka/`.`/`_`/`-`), dan **nama lengkap** via `PATCH /api/profile`. **Email tidak dapat diubah**. Ganti password lewat `POST /api/profile/password` (wajib password lama; sesi lain di-revoke, sesi saat ini dipertahankan). Semua perubahan tercatat di activity log. Bila MinIO belum dikonfigurasi, avatar memakai inisial dan unggah foto menampilkan pesan jelas.
- **Auth**: session cookie httpOnly (sliding 8 jam), token di DB berupa SHA-256 hash; reset password via token 1 jam sekali pakai; rate limit login & reset.
- **RBAC**: role dicek di API (`requireApiUser`) dan server layout (`/admin`), bukan hanya UI. Aturan area admin terpusat di `hasAdminAccess()` (`src/lib/roles.ts`).
- **Audit**: semua aksi lewat `logActivity()` (`src/lib/activity.ts`) — tabel append-only.
- **Tanpa SMTP di dev**: email reset dicetak ke console server (`[mail:dev]`).
