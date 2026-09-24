// Notu — unit test validasi Zod (rule #9 note clock out, estimasi 0,5 jam, koreksi F6)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  attachmentInputSchema,
  changePasswordSchema,
  clockOutSchema,
  correctionCreateSchema,
  correctionRejectSchema,
  profileUpdateSchema,
  taskCreateSchema,
  taskUpdateSchema,
  timeEntryEditSchema,
} from '../src/lib/validators.ts'

test('clockOutSchema: note wajib >= 10 karakter (rule #9)', () => {
  const base = { note: 'menyelesaikan desain halaman utama', taskStatus: 'done' as const }
  assert.equal(clockOutSchema.safeParse(base).success, true)
  assert.equal(clockOutSchema.safeParse({ ...base, note: 'pendek' }).success, false)
  // 9 karakter tetap gagal
  assert.equal(clockOutSchema.safeParse({ ...base, note: '123456789' }).success, false)
  // status tidak valid (cancelled bukan opsi clock out)
  assert.equal(clockOutSchema.safeParse({ ...base, taskStatus: 'cancelled' }).success, false)
})

test('taskCreateSchema: estimasi harus kelipatan 0,5 jam', () => {
  const base = {
    title: 'Task contoh',
    projectId: 'p1',
    workTypeId: 'w1',
    requesterId: 'r1',
    requestDateLocal: '2026-09-01',
    deadlineLocal: '2026-09-30T17:00',
  }
  assert.equal(taskCreateSchema.safeParse({ ...base, estimatedHours: 2.5 }).success, true)
  assert.equal(taskCreateSchema.safeParse({ ...base, estimatedHours: 1.25 }).success, false)
  assert.equal(taskCreateSchema.safeParse({ ...base, estimatedHours: 0 }).success, false)
  assert.equal(taskCreateSchema.safeParse({ ...base, estimatedHours: null }).success, true)
})

test('correctionCreateSchema: butuh minimal satu usulan & alasan >= 10 char', () => {
  const ok = correctionCreateSchema.safeParse({
    timeEntryId: 'e1',
    newClockOutLocal: '2026-09-21T18:00',
    reason: 'lupa clock out seharusnya jam 18',
  })
  assert.equal(ok.success, true)

  // tanpa usulan apapun → gagal
  assert.equal(
    correctionCreateSchema.safeParse({ timeEntryId: 'e1', reason: 'lupa clock out seharusnya jam 18' })
      .success,
    false
  )
  // alasan pendek → gagal
  assert.equal(
    correctionCreateSchema.safeParse({ timeEntryId: 'e1', newClockOutLocal: '2026-09-21T18:00', reason: 'abc' })
      .success,
    false
  )
  // format datetime salah → gagal
  assert.equal(
    correctionCreateSchema.safeParse({
      timeEntryId: 'e1',
      newClockOutLocal: '21/09/2026 18:00',
      reason: 'lupa clock out seharusnya jam 18',
    }).success,
    false
  )
})

test('correctionRejectSchema: catatan review wajib', () => {
  assert.equal(correctionRejectSchema.safeParse({ reviewNote: 'bukti tidak sesuai' }).success, true)
  assert.equal(correctionRejectSchema.safeParse({}).success, false)
  assert.equal(correctionRejectSchema.safeParse({ reviewNote: 'no' }).success, false)
})

test('timeEntryEditSchema: wajib alasan & minimal satu perubahan', () => {
  assert.equal(
    timeEntryEditSchema.safeParse({ clockOutLocal: '2026-09-21T17:00', reason: 'perbaikan' }).success,
    true
  )
  // hanya alasan tanpa perubahan → gagal
  assert.equal(timeEntryEditSchema.safeParse({ reason: 'perbaikan' }).success, false)
  // alasan pendek → gagal
  assert.equal(timeEntryEditSchema.safeParse({ taskId: 't1', reason: 'x' }).success, false)
})

test('attachmentInputSchema: metadata lampiran valid', () => {
  const ok = attachmentInputSchema.safeParse({
    objectKey: 'attachments/abc.pdf',
    fileName: 'brief.pdf',
    contentType: 'application/pdf',
    size: 1234,
  })
  assert.equal(ok.success, true)
  // objectKey wajib
  assert.equal(
    attachmentInputSchema.safeParse({ fileName: 'a.pdf', contentType: 'application/pdf', size: 1 })
      .success,
    false
  )
  // nama berkas kosong → gagal
  assert.equal(
    attachmentInputSchema.safeParse({
      objectKey: 'attachments/x',
      fileName: '  ',
      contentType: 'application/pdf',
      size: 1,
    }).success,
    false
  )
})

test('taskCreateSchema & taskUpdateSchema: menerima daftar lampiran', () => {
  const base = {
    title: 'Task contoh',
    projectId: 'p1',
    workTypeId: 'w1',
    requesterId: 'r1',
    requestDateLocal: '2026-09-01',
    deadlineLocal: '2026-09-30T17:00',
  }
  const att = { objectKey: 'attachments/a.png', fileName: 'a.png', contentType: 'image/png', size: 10 }
  assert.equal(taskCreateSchema.safeParse({ ...base, attachments: [att] }).success, true)
  assert.equal(taskUpdateSchema.safeParse({ addAttachments: [att], removeAttachmentIds: ['x'] }).success, true)
  // removeAttachmentIds harus array string
  assert.equal(taskUpdateSchema.safeParse({ removeAttachmentIds: [1] }).success, false)
})

test('clockOutSchema: lampiran opsional', () => {
  const base = { note: 'menyelesaikan desain halaman utama', taskStatus: 'in_progress' as const }
  assert.equal(clockOutSchema.safeParse(base).success, true)
  assert.equal(clockOutSchema.safeParse({ ...base, attachments: [] }).success, true)
  assert.equal(
    clockOutSchema.safeParse({
      ...base,
      attachments: [{ objectKey: 'attachments/a.png', fileName: 'a.png', contentType: 'image/png', size: 5 }],
    }).success,
    true
  )
})

test('profileUpdateSchema: username, nama, & avatar', () => {
  assert.equal(profileUpdateSchema.safeParse({ name: 'Rani Pratama' }).success, true)
  assert.equal(profileUpdateSchema.safeParse({ username: 'rani.pratama' }).success, true)
  assert.equal(profileUpdateSchema.safeParse({ username: 'rani_pratama-01' }).success, true)
  // dinormalisasi ke huruf kecil
  const parsed = profileUpdateSchema.safeParse({ username: 'Rani' })
  assert.equal(parsed.success, true)
  assert.equal(parsed.success && parsed.data.username, 'rani')
  // hapus avatar & username
  assert.equal(profileUpdateSchema.safeParse({ avatarKey: null }).success, true)
  assert.equal(profileUpdateSchema.safeParse({ username: null }).success, true)
  // username tidak valid (spasi / terlalu pendek / karakter aneh)
  assert.equal(profileUpdateSchema.safeParse({ username: 'ra' }).success, false)
  assert.equal(profileUpdateSchema.safeParse({ username: 'ra ni' }).success, false)
  assert.equal(profileUpdateSchema.safeParse({ username: 'ra@ni' }).success, false)
  // tanpa perubahan → gagal
  assert.equal(profileUpdateSchema.safeParse({}).success, false)
  // nama terlalu pendek → gagal
  assert.equal(profileUpdateSchema.safeParse({ name: 'A' }).success, false)
})

test('changePasswordSchema: butuh password lama & password baru >= 8', () => {
  assert.equal(
    changePasswordSchema.safeParse({ currentPassword: 'lama12345', newPassword: 'baru12345' }).success,
    true
  )
  assert.equal(
    changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'baru12345' }).success,
    false
  )
  assert.equal(
    changePasswordSchema.safeParse({ currentPassword: 'lama12345', newPassword: 'baru' }).success,
    false
  )
})
