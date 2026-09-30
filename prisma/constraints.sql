-- Kuro — constraint tambahan yang tidak didukung deklaratif Prisma.
-- Dijalankan setelah `prisma db push` (script: npm run db:constraints).
-- Catatan: nama tabel tanpa schema → mengikuti search_path koneksi
-- (Prisma menetapkannya sesuai parameter ?schema= pada DATABASE_URL).

-- Business rule #2: satu freelancer hanya boleh punya SATU sesi aktif.
CREATE UNIQUE INDEX IF NOT EXISTS "time_entries_one_active_per_user"
ON "TimeEntry" ("userId")
WHERE "clockOutAt" IS NULL;

-- Business rule: satu project hanya boleh punya SATU sprint aktif.
CREATE UNIQUE INDEX IF NOT EXISTS "sprints_one_active_per_project"
ON "Sprint" ("projectId")
WHERE "status" = 'active';
