#!/bin/sh
# Kuro — entrypoint produksi.
# Menyiapkan skema database sebelum server dijalankan, lalu meneruskan CMD.
set -e

# Sinkronkan skema (idempotent). Set RUN_DB_PUSH=false untuk melewatinya
# (mis. bila migrasi dijalankan terpisah).
if [ "${RUN_DB_PUSH:-true}" = "true" ]; then
  if command -v prisma >/dev/null 2>&1; then
    echo "[kuro] Sinkronisasi skema database (prisma db push)..."
    prisma db push --skip-generate --schema=./prisma/schema.prisma
    if [ -f ./prisma/constraints.sql ]; then
      echo "[kuro] Menerapkan constraint tambahan (constraints.sql)..."
      prisma db execute --file=./prisma/constraints.sql --schema=./prisma/schema.prisma
    fi
  else
    echo "[kuro] PERINGATAN: Prisma CLI tidak ditemukan — lewati sinkronisasi skema." >&2
  fi
else
  echo "[kuro] RUN_DB_PUSH=false — lewati sinkronisasi skema."
fi

# Seed awal (admin + master sample). Default nonaktif; set RUN_DB_SEED=true
# saat deploy pertama. Idempotent — aman dijalankan ulang.
if [ "${RUN_DB_SEED:-false}" = "true" ]; then
  echo "[kuro] Menjalankan seed awal (node prisma/seed.mjs)..."
  node prisma/seed.mjs
fi

exec "$@"
