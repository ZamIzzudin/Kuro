// Kuro — skema validasi Zod (Fase 0: auth)
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

/** Role aplikasi: admin, project_manager, freelancer */
export const roleSchema = z.enum(['admin', 'project_manager', 'freelancer'])

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100),
  email: z.string().trim().toLowerCase().email('Email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  role: roleSchema,
})

export const userUpdateSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100).optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.role !== undefined || v.isActive !== undefined, {
    message: 'Tidak ada perubahan',
  })

export const adminResetPasswordSchema = z.object({
  password: z.string().min(8, 'Password minimal 8 karakter'),
})

// ===== Profil sendiri (semua role): username, nama lengkap, foto, password =====

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/

/** Username unik: huruf kecil, angka, titik, underscore, strip (3–30) */
export const profileUpdateSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(USERNAME_RE, 'Username 3–30 karakter, hanya huruf kecil, angka, titik, _ atau -')
      .nullable()
      .optional(),
    name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100, 'Nama maksimal 100 karakter').optional(),
    /** Object key foto profil baru (hasil unggah). `null` = hapus foto. */
    avatarKey: z.string().max(300).nullable().optional(),
  })
  .refine(
    (v) => v.username !== undefined || v.name !== undefined || v.avatarKey !== undefined,
    { message: 'Tidak ada perubahan' }
  )

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>

/** Ganti password sendiri — wajib password lama */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Password lama wajib diisi'),
  newPassword: z.string().min(8, 'Password baru minimal 8 karakter'),
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

// ===== Enhancement: Project lengkap (banner, requester, member) =====

/** Warna HEX 6 digit, mis. #8B2FF2 — dipakai untuk banner warna project */
const hexColorField = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus format HEX, mis. #8B2FF2')

const projectFields = {
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100, 'Maksimal 100 karakter'),
  description: z
    .string()
    .trim()
    .max(1000, 'Deskripsi maksimal 1000 karakter')
    .optional()
    .nullable(),
  bannerColor: hexColorField.optional().nullable(),
  requesterIds: z.array(z.string().min(1)).max(50, 'Terlalu banyak requester').optional(),
  memberIds: z.array(z.string().min(1)).max(200, 'Terlalu banyak member').optional(),
}

export const projectCreateSchema = z.object({
  name: projectFields.name,
  description: projectFields.description,
  bannerColor: projectFields.bannerColor,
  bannerKey: z.string().max(300).optional().nullable(),
  requesterIds: projectFields.requesterIds,
  memberIds: projectFields.memberIds,
})

export const projectUpdateSchema = z
  .object({
    name: projectFields.name.optional(),
    description: projectFields.description,
    bannerColor: projectFields.bannerColor,
    bannerKey: z.string().max(300).optional().nullable(),
    isActive: z.boolean().optional(),
    requesterIds: projectFields.requesterIds,
    memberIds: projectFields.memberIds,
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.description !== undefined ||
      v.bannerColor !== undefined ||
      v.bannerKey !== undefined ||
      v.isActive !== undefined ||
      v.requesterIds !== undefined ||
      v.memberIds !== undefined,
    { message: 'Tidak ada perubahan' }
  )

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>

/** Hapus project — wajib mengetikkan nama project persis sebagai konfirmasi. */
export const projectDeleteSchema = z.object({
  confirmName: z.string().trim().min(1, 'Ketik nama project untuk konfirmasi'),
})

// ===== Fase 2: Sprint / Task / Subtask =====

export const TASK_STATUS_OPTIONS = ['todo', 'in_progress', 'review', 'revision', 'done'] as const

export const SPRINT_STATUS_OPTIONS = ['planned', 'active', 'completed'] as const

/** Panjang deskripsi (Markdown) — dinaikkan dari 2000 agar cukup untuk format MD */
const DESCRIPTION_MAX = 20_000

const estimatedHoursField = z
  .number({ invalid_type_error: 'Estimasi harus berupa angka' })
  .positive('Estimasi harus lebih dari 0')
  .max(500, 'Estimasi maksimal 500 jam')
  .refine((v) => (v * 2) % 1 === 0, 'Estimasi harus kelipatan 0,5 jam')

const dateOnlyField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid')
const dateTimeField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Format tanggal & jam tidak valid')

/** Lampiran yang sudah diunggah ke storage (metadata saja). Jumlah tidak dibatasi. */
export const attachmentInputSchema = z.object({
  objectKey: z.string().min(1, 'Lampiran tidak valid'),
  fileName: z.string().trim().min(1).max(200, 'Nama berkas maksimal 200 karakter'),
  contentType: z.string().trim().min(1).max(150),
  size: z.number().int().nonnegative(),
})

export type AttachmentInputPayload = z.infer<typeof attachmentInputSchema>

const sprintNameField = z
  .string()
  .trim()
  .min(2, 'Nama sprint minimal 2 karakter')
  .max(120, 'Nama sprint maksimal 120 karakter')

const sprintGoalField = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX, 'Sprint goal terlalu panjang')
  .optional()
  .nullable()

export const sprintCreateSchema = z
  .object({
    projectId: z.string().min(1, 'Project wajib dipilih'),
    name: sprintNameField,
    goal: sprintGoalField,
    startDate: dateOnlyField,
    endDate: dateOnlyField,
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'Tanggal selesai tidak boleh sebelum tanggal mulai',
    path: ['endDate'],
  })

export const sprintUpdateSchema = z
  .object({
    name: sprintNameField.optional(),
    goal: sprintGoalField,
    startDate: dateOnlyField.optional(),
    endDate: dateOnlyField.optional(),
    status: z.enum(SPRINT_STATUS_OPTIONS).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.goal !== undefined ||
      v.startDate !== undefined ||
      v.endDate !== undefined ||
      v.status !== undefined,
    { message: 'Tidak ada perubahan' }
  )

/** Task belum selesai saat sprint ditutup — dipilih untuk dipindah ke sprint lain; sisanya ke backlog. */
export const sprintCompleteSchema = z.object({
  /** id sprint tujuan untuk task yang DIPILIH; kosong = semua ke backlog */
  moveToSprintId: z.string().min(1).optional().nullable(),
  /** id task yang belum selesai dan dipilih pindah ke sprint tujuan */
  taskIds: z.array(z.string().min(1)).max(500).optional(),
})

/** Kelola keanggotaan task pada sebuah sprint (tambah dari Backlog / keluarkan). */
export const sprintTasksSchema = z
  .object({
    addTaskIds: z.array(z.string().min(1)).max(500).optional(),
    removeTaskIds: z.array(z.string().min(1)).max(500).optional(),
  })
  .refine((v) => (v.addTaskIds?.length ?? 0) > 0 || (v.removeTaskIds?.length ?? 0) > 0, {
    message: 'Tidak ada task yang dipilih',
  })

/** Satu baris subtask dalam payload task (buat/ubah). `id` ada = subtask lama. */
export const subtaskInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1, 'Judul subtask wajib diisi').max(150, 'Judul subtask maksimal 150 karakter'),
  description: z.string().trim().max(DESCRIPTION_MAX, 'Deskripsi subtask terlalu panjang').optional().nullable(),
  assigneeId: z.string().min(1).optional().nullable(),
  estimatedHours: estimatedHoursField.optional().nullable(),
  position: z.number().int().min(0).max(9999).optional(),
})

export type SubtaskInput = z.infer<typeof subtaskInputSchema>

export const subtaskUpdateSchema = z
  .object({
    title: z.string().trim().min(1, 'Judul subtask wajib diisi').max(150).optional(),
    description: z.string().trim().max(DESCRIPTION_MAX).optional().nullable(),
    assigneeId: z.string().min(1).optional().nullable(),
    estimatedHours: estimatedHoursField.optional().nullable(),
    position: z.number().int().min(0).max(9999).optional(),
    // Admin boleh mengubah status subtask termasuk mengembalikannya ke revision.
    status: z.enum(['todo', 'in_progress', 'review', 'revision', 'done']).optional(),
    addAttachments: z.array(attachmentInputSchema).max(50).optional(),
    removeAttachmentIds: z.array(z.string().min(1)).max(100).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada perubahan' })

export const taskCreateSchema = z.object({
  title: z.string().trim().min(3, 'Judul minimal 3 karakter').max(120, 'Judul maksimal 120 karakter'),
  description: z.string().trim().max(DESCRIPTION_MAX, 'Deskripsi terlalu panjang').optional().nullable(),
  projectId: z.string().min(1, 'Project wajib dipilih'),
  workTypeId: z.string().min(1, 'Jenis pekerjaan wajib dipilih'),
  requesterId: z.string().min(1, 'Requester wajib dipilih'),
  // Multi-assignee: daftar freelancer yang boleh mengerjakan subtask task ini
  assigneeIds: z.array(z.string().min(1)).max(50, 'Terlalu banyak assignee').optional(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  estimatedHours: estimatedHoursField.optional().nullable(),
  requestDateLocal: dateOnlyField,
  deadlineLocal: dateTimeField,
  attachments: z.array(attachmentInputSchema).max(50).optional(),
  // Subtask awal — wajib minimal satu agar senantiasa ada unit kerja
  subtasks: z.array(subtaskInputSchema).min(1, 'Minimal satu subtask').max(100, 'Terlalu banyak subtask'),
})

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(3, 'Judul minimal 3 karakter').max(120).optional(),
  description: z.string().trim().max(DESCRIPTION_MAX).optional().nullable(),
  projectId: z.string().min(1).optional(),
  workTypeId: z.string().min(1).optional(),
  requesterId: z.string().min(1).optional(),
  assigneeIds: z.array(z.string().min(1)).max(50).optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  estimatedHours: estimatedHoursField.optional().nullable(),
  requestDateLocal: dateOnlyField.optional(),
  deadlineLocal: dateTimeField.optional(),
  status: z.enum(['todo', 'in_progress', 'review', 'revision', 'done']).optional(),
  // Sinkronisasi daftar subtask: item tanpa `id` dibuat, item dengan `id` diperbarui.
  // Subtask lama yang tidak ada di daftar akan dihapus (bila belum punya time entry).
  subtasks: z.array(subtaskInputSchema).max(100).optional(),
  // Lampiran BARU yang ditambahkan (bukan pengganti).
  addAttachments: z.array(attachmentInputSchema).max(50).optional(),
  // Id lampiran task yang dihapus.
  removeAttachmentIds: z.array(z.string().min(1)).max(100).optional(),
})

export const taskStatusSchema = z.object({
  status: z.enum(TASK_STATUS_OPTIONS, { errorMap: () => ({ message: 'Status tidak valid' }) }),
})

/** Minta Revisi — kembalikan subtask terpilih ke status `revision` + catatan alasan. */
export const taskRevisionSchema = z.object({
  // Catatan alasan revisi (opsional, ditampilkan di detail task).
  note: z.string().trim().max(1000, 'Catatan revisi maksimal 1000 karakter').optional().nullable(),
  // Subtask yang dikembalikan menjadi revision (minimal satu).
  subtaskIds: z.array(z.string().min(1)).min(1, 'Pilih minimal satu subtask').max(100),
})

// ===== Subtask (unit kerja) =====

/** Freelancer mengubah status subtask miliknya (setara done-lock lama) */
export const subtaskStatusSchema = z.object({
  status: z.enum(TASK_STATUS_OPTIONS, { errorMap: () => ({ message: 'Status tidak valid' }) }),
})

// ===== Fase 3: Time Entries (F2) =====

/** Status task yang boleh dipilih saat clock out (rule #9) */
export const CHECKOUT_STATUS_OPTIONS = ['todo', 'in_progress', 'review', 'done'] as const

export const clockInSchema = z.object({
  subtaskId: z.string().min(1, 'Subtask wajib dipilih'),
})

export const switchTaskSchema = z.object({
  subtaskId: z.string().min(1, 'Subtask wajib dipilih'),
  // Q4: note saat switch OPSIONAL
  note: z.string().trim().max(1000, 'Catatan maksimal 1000 karakter').optional().nullable(),
})

export const clockOutSchema = z.object({
  // rule #9: note wajib minimal 10 karakter
  note: z.string().trim().min(10, 'Catatan minimal 10 karakter').max(2000, 'Catatan maksimal 2000 karakter'),
  subtaskStatus: z.enum(CHECKOUT_STATUS_OPTIONS, {
    errorMap: () => ({ message: 'Status subtask tidak valid' }),
  }),
  // Lampiran opsional saat clock out — jumlah tidak dibatasi.
  attachments: z.array(attachmentInputSchema).max(50).optional(),
})

// ===== Fase 5: Rekap & Export / Period Lock (F5) =====

const yearField = z
  .number({ invalid_type_error: 'Tahun tidak valid' })
  .int('Tahun tidak valid')
  .min(2000, 'Tahun tidak valid')
  .max(2100, 'Tahun tidak valid')

const monthField = z
  .number({ invalid_type_error: 'Bulan tidak valid' })
  .int('Bulan tidak valid')
  .min(1, 'Bulan tidak valid')
  .max(12, 'Bulan tidak valid')

/** Periode tahun/bulan (query string) */
export const periodQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
})

export const reportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  userIds: z.string().optional(),
})

export const exportQuerySchema = reportQuerySchema.extend({
  format: z.enum(['xlsx', 'pdf'], { errorMap: () => ({ message: 'Format export tidak valid' }) }),
})

export const periodLockCreateSchema = z.object({
  year: yearField,
  month: monthField,
  note: z.string().trim().max(300, 'Catatan maksimal 300 karakter').optional().nullable(),
})

export const periodLockDeleteSchema = z.object({
  reason: z.string().trim().min(5, 'Alasan minimal 5 karakter').max(300, 'Alasan maksimal 300 karakter'),
})

export type Period = { year: number; month: number }

// ===== Fase 6: Koreksi (F6) =====

/** Pengajuan koreksi oleh freelancer — minimal satu usulan perubahan */
export const correctionCreateSchema = z
  .object({
    timeEntryId: z.string().min(1, 'Time entry wajib dipilih'),
    newClockInLocal: dateTimeField.optional().nullable(),
    newClockOutLocal: dateTimeField.optional().nullable(),
    newSubtaskId: z.string().min(1).optional().nullable(),
    reason: z
      .string({ required_error: 'Alasan wajib diisi', invalid_type_error: 'Alasan wajib diisi' })
      .trim()
      .min(10, 'Alasan minimal 10 karakter')
      .max(1000, 'Alasan maksimal 1000 karakter'),
  })
  .refine((v) => !!v.newClockInLocal || !!v.newClockOutLocal || !!v.newSubtaskId, {
    message: 'Isi minimal satu perubahan (jam masuk, jam keluar, atau subtask)',
  })

export type CorrectionCreateInput = z.infer<typeof correctionCreateSchema>

/** Admin menolak koreksi — wajib catatan review */
export const correctionRejectSchema = z.object({
  reviewNote: z
    .string({ required_error: 'Catatan review wajib diisi', invalid_type_error: 'Catatan review wajib diisi' })
    .trim()
    .min(5, 'Catatan minimal 5 karakter')
    .max(500, 'Catatan maksimal 500 karakter'),
})

/** Edit langsung time entry oleh admin (Q5) — wajib alasan, ter-audit */
export const timeEntryEditSchema = z
  .object({
    clockInLocal: dateTimeField.optional(),
    clockOutLocal: dateTimeField.optional().nullable(),
    subtaskId: z.string().min(1).optional(),
    note: z.string().trim().max(2000, 'Catatan maksimal 2000 karakter').optional().nullable(),
    reason: z
      .string({ required_error: 'Alasan wajib diisi', invalid_type_error: 'Alasan wajib diisi' })
      .trim()
      .min(5, 'Alasan minimal 5 karakter')
      .max(300, 'Alasan maksimal 300 karakter'),
  })
  .refine(
    (v) =>
      v.clockInLocal !== undefined ||
      v.clockOutLocal !== undefined ||
      v.subtaskId !== undefined ||
      v.note !== undefined,
    { message: 'Tidak ada perubahan' }
  )

export type TimeEntryEditInput = z.infer<typeof timeEntryEditSchema>
