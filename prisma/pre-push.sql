-- Kuro — migrasi data yang WAJIB jalan SEBELUM `prisma db push`.
--
-- Status `cancelled` dihapus dari enum TaskStatus (digantikan `revision`).
-- Baris lama yang masih memakai `cancelled` harus dipindahkan lebih dulu,
-- jika tidak Postgres gagal saat enum dibuat ulang.
--
-- Idempotent: blok di bawah hanya jalan bila enum MASIH punya label 'cancelled'.
-- Memakai EXECUTE (dynamic SQL) agar literal 'cancelled' tidak di-typecheck
-- ketika nilainya sudah tidak ada di enum (kalau begitu, blok dilewati).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TaskStatus' AND e.enumlabel = 'cancelled'
  ) THEN
    EXECUTE 'UPDATE "Task" SET status = ''done'' WHERE status = ''cancelled''';
    EXECUTE 'UPDATE "Subtask" SET status = ''done'' WHERE status = ''cancelled''';
    EXECUTE 'UPDATE "TimeEntry" SET "taskStatusAtCheckout" = ''done'' WHERE "taskStatusAtCheckout" = ''cancelled''';
    EXECUTE 'UPDATE "TaskSprintHistory" SET "statusAtLeave" = ''done'' WHERE "statusAtLeave" = ''cancelled''';
  END IF;
END $$;
