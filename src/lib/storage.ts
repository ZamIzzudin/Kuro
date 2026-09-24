// Kuro — penyimpanan objek (MinIO / S3-compatible) untuk banner project.
//
// Konfigurasi via env MINIO_*:
//   MINIO_ENDPOINT   host MinIO (tanpa skema), mis. minio.internal atau storage.domain.com
//   MINIO_PORT       default 9000 (atau 443 bila MINIO_USE_SSL=true)
//   MINIO_USE_SSL    "true" bila memakai HTTPS
//   MINIO_ACCESS_KEY
//   MINIO_SECRET_KEY
//   MINIO_BUCKET     default "notu"
//
// Bila belum dikonfigurasi, fitur upload gambar dinonaktifkan dengan pesan ramah —
// banner WARNA tetap berfungsi tanpa MinIO.
import crypto from 'crypto'
import { Client } from 'minio'

const endpoint = process.env.MINIO_ENDPOINT
const useSSL = process.env.MINIO_USE_SSL === 'true'
// Bila MINIO_PORT kosong → 443 saat HTTPS, 9000 saat HTTP.
// (Berguna bila MinIO diletakkan di belakang reverse proxy pada port standar 443.)
const port = Number(process.env.MINIO_PORT || (useSSL ? 443 : 9000))
const accessKey = process.env.MINIO_ACCESS_KEY
const secretKey = process.env.MINIO_SECRET_KEY

export const BUCKET = process.env.MINIO_BUCKET || 'notu'
export const BANNER_PREFIX = 'project-banners'
export const MAX_BANNER_BYTES = 2 * 1024 * 1024 // 2 MB
export const ALLOWED_BANNER_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

// Lampiran task & clock out: boleh berkas apa pun, jumlah tidak dibatasi.
// Batas ukuran per berkas tetap ada agar penyimpanan tidak disalahgunakan.
export const ATTACHMENT_PREFIX = 'attachments'
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25 MB per berkas

// Foto profil user (avatar). Hanya gambar, batas 2 MB.
export const AVATAR_PREFIX = 'avatars'
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024 // 2 MB
// Avatar hanya menerima format gambar yang sama dengan banner.
export const ALLOWED_AVATAR_TYPES = ALLOWED_BANNER_TYPES

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      'Penyimpanan gambar (MinIO) belum dikonfigurasi. Isi MINIO_ENDPOINT, MINIO_ACCESS_KEY, dan MINIO_SECRET_KEY di environment server.'
    )
    this.name = 'StorageNotConfiguredError'
  }
}

export function isStorageConfigured(): boolean {
  return Boolean(endpoint && accessKey && secretKey)
}

let client: Client | null = null

function getClient(): Client {
  if (!isStorageConfigured()) throw new StorageNotConfiguredError()
  if (!client) {
    client = new Client({
      endPoint: endpoint!,
      port,
      useSSL,
      accessKey: accessKey!,
      secretKey: secretKey!,
    })
  }
  return client
}

let bucketEnsured = false

/** Pastikan bucket ada (dipanggil otomatis sebelum operasi tulis/baca pertama). */
export async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return
  const c = getClient()
  const exists = await c.bucketExists(BUCKET).catch(() => false)
  if (!exists) await c.makeBucket(BUCKET)
  bucketEnsured = true
}

/** Buat object key unik untuk banner project. */
export function bannerObjectKey(ext: string): string {
  return `${BANNER_PREFIX}/${crypto.randomUUID()}.${ext}`
}

/** Ekstensi aman dari nama berkas (alnum, maks 10 karakter) — dipakai lampiran. */
export function safeExtension(fileName: string): string {
  const raw = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1) : ''
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)
}

/** Buat object key unik untuk lampiran (task / clock out). */
export function attachmentObjectKey(fileName: string): string {
  const ext = safeExtension(fileName)
  return `${ATTACHMENT_PREFIX}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`
}

/** Buat object key unik untuk foto profil. */
export function avatarObjectKey(ext: string): string {
  return `${AVATAR_PREFIX}/${crypto.randomUUID()}.${ext}`
}

export async function putObject(key: string, data: Buffer, contentType: string): Promise<void> {
  const c = getClient()
  await ensureBucket()
  await c.putObject(BUCKET, key, data, data.length, { 'Content-Type': contentType })
}

export async function getObjectBuffer(key: string): Promise<{ body: Buffer; contentType: string }> {
  const c = getClient()
  await ensureBucket()
  const stream = await c.getObject(BUCKET, key)
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
  const stat = await c.statObject(BUCKET, key).catch(() => null)
  const rawType = stat?.metaData?.['content-type']
  const contentType = typeof rawType === 'string' ? rawType : 'application/octet-stream'
  return { body: Buffer.concat(chunks), contentType }
}

export async function removeObject(key: string): Promise<void> {
  const c = getClient()
  await c.removeObject(BUCKET, key).catch(() => {})
}

/** Cek konektivitas + bucket — dipakai script `npm run storage:check`. */
export async function pingStorage(): Promise<{ ok: true; bucket: string; endpoint: string }> {
  await ensureBucket()
  return { ok: true, bucket: BUCKET, endpoint: `${useSSL ? 'https' : 'http'}://${endpoint}:${port}` }
}
