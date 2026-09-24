// Kuro — helper lampiran (task & clock out).
// Metadata disimpan di DB, isi berkas di MinIO. Browser mengunduh lewat proxy
// /api/attachments/[id] sehingga object key tetap privat.
import type { Prisma } from '@prisma/client'

export type AttachmentItem = {
  id: string
  fileName: string
  contentType: string
  size: number
  /** benar bila contentType berupa gambar (bisa ditampilkan inline) */
  isImage: boolean
  /** URL proxy unduh/tampil */
  url: string
  createdAt: string
}

type AttachmentRow = {
  id: string
  fileName: string
  contentType: string
  size: number
  createdAt: Date
}

export function mapAttachment(row: AttachmentRow): AttachmentItem {
  return {
    id: row.id,
    fileName: row.fileName,
    contentType: row.contentType,
    size: row.size,
    isImage: row.contentType.startsWith('image/'),
    url: `/api/attachments/${row.id}`,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Lampiran yang dibuat dalam satu request (task / time entry) — payload dari client.
 * Berisi metadata objek yang sudah diunggah lewat /api/uploads/attachment.
 */
export type AttachmentInput = {
  objectKey: string
  fileName: string
  contentType: string
  size: number
}

export async function createTaskAttachments(
  tx: Prisma.TransactionClient,
  taskId: string,
  uploadedById: string,
  items: AttachmentInput[]
) {
  if (!items.length) return
  await tx.taskAttachment.createMany({
    data: items.map((a) => ({
      taskId,
      uploadedById,
      objectKey: a.objectKey,
      fileName: a.fileName,
      contentType: a.contentType,
      size: a.size,
    })),
  })
}

export async function createTimeEntryAttachments(
  tx: Prisma.TransactionClient,
  timeEntryId: string,
  items: AttachmentInput[]
) {
  if (!items.length) return
  await tx.timeEntryAttachment.createMany({
    data: items.map((a) => ({
      timeEntryId,
      objectKey: a.objectKey,
      fileName: a.fileName,
      contentType: a.contentType,
      size: a.size,
    })),
  })
}
