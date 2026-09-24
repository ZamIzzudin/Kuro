// Kuro — seed awal (Fase 0)
// - Akun admin pertama dari env INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD
// - Master sample (Project / Jenis Pekerjaan / Requester) — idempotent
// - SEED_DEMO=1 → tambah 1 akun freelancer demo
// Jalankan: npm run db:seed
import { existsSync, readFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

// Prisma Client tidak memuat .env otomatis saat dijalankan lewat `node`.
const envPath = new URL('../.env', import.meta.url)
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

const db = new PrismaClient()

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL || 'admin@notu.local'
  const password = process.env.INITIAL_ADMIN_PASSWORD || 'admin12345'

  const admin = await db.user.upsert({
    where: { email },
    update: { username: 'admin' },
    create: {
      email,
      name: 'Admin Kuro',
      username: 'admin',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'admin',
    },
  })
  console.log(`✔ Admin siap: ${admin.email}`)

  const projects = ['Website Revamp', 'Social Media Campaign']
  const workTypes = ['Desain', 'Development', 'Konten']
  const requesters = ['Klien Utama', 'Internal Tim']

  const projectRows = []
  for (const name of projects) {
    projectRows.push(
      await db.project.upsert({ where: { name }, update: {}, create: { name } })
    )
  }
  for (const name of workTypes) {
    await db.workType.upsert({ where: { name }, update: {}, create: { name } })
  }
  const requesterRows = []
  for (const name of requesters) {
    requesterRows.push(
      await db.requester.upsert({
        where: { name },
        update: {},
        create: { name, creatorId: admin.id },
      })
    )
  }
  console.log(
    `✔ Master sample siap: ${projects.length} project, ${workTypes.length} jenis pekerjaan, ${requesters.length} requester`
  )

  if (process.env.SEED_DEMO === '1') {
    const demoEmail = 'freelancer@notu.local'
    const freelancer = await db.user.upsert({
      where: { email: demoEmail },
      update: { username: 'freelancer' },
      create: {
        email: demoEmail,
        name: 'Freelancer Demo',
        username: 'freelancer',
        passwordHash: await bcrypt.hash('freelancer12345', 10),
        role: 'freelancer',
      },
    })
    console.log(`✔ Freelancer demo siap: ${freelancer.email} (password: freelancer12345)`)

    // Demo enhancement: kaitkan requester & assign freelancer ke tiap project,
    // beri warna banner berbeda, lalu buat beberapa task contoh.
    const bannerColors = ['#8B2FF2', '#2F6FED']
    for (let i = 0; i < projectRows.length; i++) {
      const project = projectRows[i]
      const req = requesterRows[i % requesterRows.length]
      await db.project.update({
        where: { id: project.id },
        data: {
          bannerColor: project.bannerColor ?? bannerColors[i % bannerColors.length],
          description: project.description ?? `Project contoh: ${project.name}`,
        },
      })
      await db.projectRequester.createMany({
        data: [{ projectId: project.id, requesterId: req.id }],
        skipDuplicates: true,
      })
      await db.projectMember.createMany({
        data: [{ projectId: project.id, userId: freelancer.id }],
        skipDuplicates: true,
      })
    }
    console.log('✔ Project demo: banner warna, requester, & member freelancer terhubung')

    const workTypeRows = await db.workType.findMany({ take: 2 })
    const demoDeadline = new Date(Date.now() + 14 * 86_400_000)
    for (let i = 0; i < projectRows.length; i++) {
      const title = `[Demo] Task contoh ${i + 1}`
      const exists = await db.task.findFirst({ where: { title } })
      if (exists) continue
      await db.task.create({
        data: {
          title,
          description: 'Task contoh dari seed demo — silakan hapus bila tidak diperlukan.',
          projectId: projectRows[i].id,
          workTypeId: workTypeRows[i % workTypeRows.length].id,
          requesterId: requesterRows[i % requesterRows.length].id,
          assigneeId: i === 0 ? freelancer.id : null,
          priority: i === 0 ? 'high' : 'medium',
          estimatedHours: 4,
          requestDate: new Date(),
          deadlineAt: demoDeadline,
          createdById: admin.id,
        },
      })
    }
    console.log('✔ Task demo dibuat (1 di-assign, 1 bucket bersama)')
  }

  console.log('\nSelesai. Catatan: akun admin memakai INITIAL_ADMIN_PASSWORD — ganti password setelah login pertama.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
