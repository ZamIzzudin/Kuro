// Kuro — singleton PrismaClient (hindari banyak koneksi saat dev hot-reload)
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Opsi transaksi interaktif. Default Prisma hanya 5 detik — terlalu ketat bila
// database jauh (mis. remote/staging), sehingga transaksi kedaluwarsa di tengah
// jalan dan memunculkan error P2028 "Transaction not found".
export const TX_OPTIONS = {
  maxWait: 15_000, // tunggu koneksi dari pool
  timeout: 30_000, // durasi maksimum transaksi berjalan
} as const
