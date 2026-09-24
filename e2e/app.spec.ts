// Notu — E2E: alur utama freelancer (login → clock in → switch → clock out),
// alur koreksi (ajukan → admin setujui), RBAC, dan header keamanan.
// Data uji disiapkan global-setup.mjs & dibersihkan global-teardown.mjs.
import { test, expect, type Page } from '@playwright/test'

const FREELANCER = { email: 'freelancer@notu.local', password: 'freelancer12345' }
const ADMIN = { email: 'admin@notu.local', password: 'admin12345' }
const TASK_A = 'Task Uji E2E'
const TASK_B = 'Task Uji E2E 2'

async function login(page: Page, who: { email: string; password: string }) {
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

async function clockOutIfRunning(page: Page) {
  if (await page.getByText('Sedang berjalan').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Clock Out' }).first().click()
    await page.getByLabel('Catatan pekerjaan').fill('membersihkan sesi uji sebelumnya')
    await page.getByRole('dialog', { name: 'Clock Out' }).getByRole('button', { name: 'Clock Out' }).click()
    await expect(page.getByText('Belum ada sesi berjalan')).toBeVisible()
  }
}

test.describe('Freelancer — clock in / switch / clock out', () => {
  test('happy path', async ({ page }) => {
    await login(page, FREELANCER)
    await expect(page).toHaveURL(/\/home/)
    await clockOutIfRunning(page)

    // Clock in ke task pertama
    await page.getByRole('button', { name: 'Clock In' }).first().click()
    const picker = page.getByRole('dialog', { name: 'Mulai Kerja' })
    await picker.getByRole('button', { name: new RegExp(TASK_A) }).click()
    await picker.getByRole('button', { name: 'Clock In' }).click()

    // Timer berjalan + judul task tampil
    await expect(page.getByText('Sedang berjalan')).toBeVisible()
    await expect(page.getByRole('heading', { name: TASK_A })).toBeVisible()
    await expect(page.locator('font-mono', { hasText: /\d{2}:\d{2}:\d{2}/ })).toBeVisible()

    // Switch task (note opsional)
    await page.getByRole('button', { name: 'Switch Task' }).click()
    const sw = page.getByRole('dialog', { name: 'Switch Task' })
    await sw.getByRole('button', { name: new RegExp(TASK_B) }).click()
    await sw.getByLabel('Catatan (opsional)').fill('pindah ke task lain')
    await sw.getByRole('button', { name: 'Pindah' }).click()
    await expect(page.getByRole('heading', { name: TASK_B })).toBeVisible()

    // Clock out: catatan < 10 karakter menonaktifkan tombol, lalu kirim yang valid
    await page.getByRole('button', { name: 'Clock Out' }).first().click()
    const co = page.getByRole('dialog', { name: 'Clock Out' })
    await co.getByLabel('Catatan pekerjaan').fill('pendek')
    await expect(co.getByRole('button', { name: 'Clock Out' })).toBeDisabled()
    await co.getByLabel('Catatan pekerjaan').fill('menyelesaikan task uji E2E hari ini')
    await co.getByRole('button', { name: 'Clock Out' }).click()

    await expect(page.getByText('Belum ada sesi berjalan')).toBeVisible()

    // Riwayat muncul di Jam Kerja Saya
    await page.goto('/my-time')
    await expect(page.getByRole('heading', { name: 'Jam Kerja Saya' })).toBeVisible()
    await expect(page.getByText('menyelesaikan task uji E2E hari ini')).toBeVisible()
  })
})

test.describe('Koreksi — pengajuan & review', () => {
  test('freelancer mengajukan, admin menyetujui', async ({ page }) => {
    await login(page, FREELANCER)
    await page.goto('/corrections')
    await expect(page.getByRole('heading', { name: 'Koreksi Saya' })).toBeVisible()

    await page.getByRole('button', { name: 'Ajukan Koreksi' }).click()
    const form = page.getByRole('dialog', { name: 'Ajukan Koreksi' })

    // Pilih sesi terakhir (task kedua, yang baru selesai)
    const select = form.locator('#cor-entry')
    const optionText = await select.locator('option').last().textContent()
    expect(optionText).toContain(TASK_B)
    await select.selectOption({ index: (await select.locator('option').count()) - 1 })

    // Ubah jam keluar +30 menit agar ada usulan perubahan
    const clockOut = await form.locator('#cor-out').inputValue()
    expect(clockOut).not.toBe('')
    const [datePart, timePart] = clockOut.split('T')
    const [h, m] = timePart.split(':').map(Number)
    const newTime = `${String(h).padStart(2, '0')}:${String((m + 30) % 60).padStart(2, '0')}`
    await form.locator('#cor-out').fill(`${datePart}T${newTime}`)

    await form.getByLabel('Alasan koreksi').fill('jam keluar seharusnya lebih lambat dari catatan')
    await form.getByRole('button', { name: 'Kirim Pengajuan' }).click()

    await expect(page.getByText('Menunggu Review').first()).toBeVisible()

    // Admin menyetujui
    await page.context().clearCookies()
    await login(page, ADMIN)
    await page.goto('/admin/corrections')
    await expect(page.getByRole('heading', { name: 'Review Koreksi' })).toBeVisible()
    await page.getByRole('button', { name: 'Setujui' }).first().click()
    // Kartu pending hilang dari filter "Menunggu" → tampil "Sudah direview"
    await expect(page.getByText('Sudah direview').first()).toBeVisible()
  })
})

test.describe('RBAC', () => {
  test('freelancer tidak bisa membuka /admin', async ({ page }) => {
    await login(page, FREELANCER)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/home/)
  })

  test('belum login diarahkan ke /login', async ({ page }) => {
    await page.goto('/admin/reports')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Keamanan', () => {
  test('header keamanan terkirim', async ({ request }) => {
    const res = await request.get('/login')
    expect(res.headers()['x-content-type-options']).toBe('nosniff')
    expect(res.headers()['x-frame-options']).toBe('DENY')
    expect(res.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
  })

  test('open redirect via ?next=// ditolak', async ({ page }) => {
    await page.goto('/login?next=//example.com')
    await page.fill('#email', FREELANCER.email)
    await page.fill('#password', FREELANCER.password)
    await page.getByRole('button', { name: 'Masuk' }).click()
    await page.waitForURL(/\/home/)
    expect(new URL(page.url()).host).toBe('localhost:3100')
  })

  test('login gagal menampilkan pesan generik', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#email', FREELANCER.email)
    await page.fill('#password', 'password-salah-sekali')
    await page.getByRole('button', { name: 'Masuk' }).click()
    await expect(page.getByText('Email atau password salah')).toBeVisible()
  })
})
