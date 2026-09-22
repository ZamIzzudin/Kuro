// Notu — skema validasi Zod (Fase 0: auth)
import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
})

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email tidak valid'),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Token tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
})

// ===== Fase 1: Users & Masters =====

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100),
  email: z.string().trim().toLowerCase().email('Email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  role: z.enum(['admin', 'freelancer']),
})

export const userUpdateSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100).optional(),
    role: z.enum(['admin', 'freelancer']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.role !== undefined || v.isActive !== undefined, {
    message: 'Tidak ada perubahan',
  })

export const adminResetPasswordSchema = z.object({
  password: z.string().min(8, 'Password minimal 8 karakter'),
})

export const masterCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100, 'Maksimal 100 karakter'),
})

export const masterUpdateSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.isActive !== undefined, {
    message: 'Tidak ada perubahan',
  })
