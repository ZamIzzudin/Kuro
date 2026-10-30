-- Kuro — migrasi data yang WAJIB jalan SEBELUM `prisma db push`.
--
-- Status `cancelled` dihapus dari enum TaskStatus (digantikan `revision`).
-- Baris lama yang masih memakai `cancelled` harus dipindahkan lebih dulu,
-- jika tidak Postgres gagal saat enum dibuat ulang.
--
-- Idempotent: blok di bawah hanya jalan bila enum TaskStatus yang dipakai
-- kolom `Task.status` di schema aktif MASIH punya label 'cancelled'.
-- Pengecekan enum sengaja di-scope lewat `to_regclass('"Task"')` (mengikuti
-- search_path) — bukan `pg_type` global — karena satu database bisa punya
-- beberapa schema (mis. schema backup) dengan enum `TaskStatus` bernama sama.
-- Memakai EXECUTE (dynamic SQL) agar literal 'cancelled' tidak di-typecheck
-- ketika nilainya sudah tidak ada di enum (kalau begitu, blok dilewati).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    WHERE e.enumtypid = (
        SELECT a.atttypid
        FROM pg_attribute a
        WHERE a.attrelid = to_regclass('"Task"')
          AND a.attname = 'status'
          AND NOT a.attisdropped
      )
      AND e.enumlabel = 'cancelled'
  ) THEN
    EXECUTE 'UPDATE "Task" SET status = ''done'' WHERE status = ''cancelled''';
    EXECUTE 'UPDATE "Subtask" SET status = ''done'' WHERE status = ''cancelled''';
    EXECUTE 'UPDATE "TimeEntry" SET "taskStatusAtCheckout" = ''done'' WHERE "taskStatusAtCheckout" = ''cancelled''';
    EXECUTE 'UPDATE "TaskSprintHistory" SET "statusAtLeave" = ''done'' WHERE "statusAtLeave" = ''cancelled''';
  END IF;
END $$;
