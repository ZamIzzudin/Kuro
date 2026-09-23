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

// ===== Fase 2: Task =====

export const TASK_STATUS_OPTIONS = ['todo', 'in_progress', 'review', 'done'] as const

const estimatedHoursField = z
  .number({ invalid_type_error: 'Estimasi harus berupa angka' })
  .positive('Estimasi harus lebih dari 0')
  .max(500, 'Estimasi maksimal 500 jam')
  .refine((v) => (v * 2) % 1 === 0, 'Estimasi harus kelipatan 0,5 jam')

const dateOnlyField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid')
const dateTimeField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Format tanggal & jam tidak valid')

export const taskCreateSchema = z.object({
  title: z.string().trim().min(3, 'Judul minimal 3 karakter').max(120, 'Judul maksimal 120 karakter'),
  description: z.string().trim().max(2000, 'Deskripsi maksimal 2000 karakter').optional().nullable(),
  projectId: z.string().min(1, 'Project wajib dipilih'),
  workTypeId: z.string().min(1, 'Jenis pekerjaan wajib dipilih'),
  requesterId: z.string().min(1, 'Requester wajib dipilih'),
  assigneeId: z.string().optional().nullable(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  estimatedHours: estimatedHoursField.optional().nullable(),
  requestDateLocal: dateOnlyField,
  deadlineLocal: dateTimeField,
})

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(3, 'Judul minimal 3 karakter').max(120).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  projectId: z.string().min(1).optional(),
  workTypeId: z.string().min(1).optional(),
  requesterId: z.string().min(1).optional(),
  assigneeId: z.string().optional().nullable(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  estimatedHours: estimatedHoursField.optional().nullable(),
  requestDateLocal: dateOnlyField.optional(),
  deadlineLocal: dateTimeField.optional(),
  status: z.enum(['todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
})

export const taskStatusSchema = z.object({
  status: z.enum(TASK_STATUS_OPTIONS, { errorMap: () => ({ message: 'Status tidak valid' }) }),
})

// ===== Fase 3: Time Entries (F2) =====

/** Status task yang boleh dipilih saat clock out (rule #9) */
export const CHECKOUT_STATUS_OPTIONS = ['todo', 'in_progress', 'review', 'done'] as const

export const clockInSchema = z.object({
  taskId: z.string().min(1, 'Task wajib dipilih'),
})

export const switchTaskSchema = z.object({
  taskId: z.string().min(1, 'Task wajib dipilih'),
  // Q4: note saat switch OPSIONAL
  note: z.string().trim().max(1000, 'Catatan maksimal 1000 karakter').optional().nullable(),
})

export const clockOutSchema = z.object({
  // rule #9: note wajib minimal 10 karakter
  note: z.string().trim().min(10, 'Catatan minimal 10 karakter').max(2000, 'Catatan maksimal 2000 karakter'),
  taskStatus: z.enum(CHECKOUT_STATUS_OPTIONS, {
    errorMap: () => ({ message: 'Status task tidak valid' }),
  }),
})
