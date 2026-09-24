// Notu — cek konektivitas MinIO & bucket banner.
// Jalankan: npm run storage:check
import { existsSync, readFileSync } from 'node:fs'
import { Client } from 'minio'

// Muat .env secara sederhana (tanpa menambah dependensi)
const envPath = new URL('../.env', import.meta.url)
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

const endpoint = process.env.MINIO_ENDPOINT
const accessKey = process.env.MINIO_ACCESS_KEY
const secretKey = process.env.MINIO_SECRET_KEY
const useSSL = process.env.MINIO_USE_SSL === 'true'
const port = Number(process.env.MINIO_PORT || (useSSL ? 443 : 9000))
const bucket = process.env.MINIO_BUCKET || 'notu'

if (!endpoint || !accessKey || !secretKey) {
  console.error('✖ MinIO belum dikonfigurasi. Isi MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY di .env')
  process.exit(1)
}

const client = new Client({ endPoint: endpoint, port, useSSL, accessKey, secretKey })

try {
  const exists = await client.bucketExists(bucket)
  if (!exists) {
    await client.makeBucket(bucket)
    console.log(`✔ Bucket "${bucket}" dibuat`)
  } else {
    console.log(`✔ Bucket "${bucket}" ditemukan`)
  }
  // Uji tulis–baca–hapus
  const key = `project-banners/_healthcheck-${Date.now()}.txt`
  await client.putObject(bucket, key, Buffer.from('ok'), 2, { 'Content-Type': 'text/plain' })
  const obj = await client.getObject(bucket, key)
  const chunks = []
  for await (const c of obj) chunks.push(c)
  await client.removeObject(bucket, key)
  console.log(`✔ Uji tulis/baca/hapus berhasil (${Buffer.concat(chunks).toString()})`)
  console.log(`\nMinIO siap dipakai: ${useSSL ? 'https' : 'http'}://${endpoint}:${port}/${bucket}`)
} catch (e) {
  console.error('✖ Gagal terhubung ke MinIO:', e.message)
  process.exit(1)
}
