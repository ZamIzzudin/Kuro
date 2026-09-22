-- Notu — constraint tambahan yang tidak didukung deklaratif Prisma.
-- Dijalankan setelah `prisma db push` (script: npm run db:constraints).

-- Business rule #2: satu freelancer hanya boleh punya SATU sesi aktif.
CREATE UNIQUE INDEX IF NOT EXISTS "time_entries_one_active_per_user"
ON "TimeEntry" ("userId")
WHERE "clockOutAt" IS NULL;
