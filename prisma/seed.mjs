// Notu — seed awal (Fase 0)
// - Akun admin pertama dari env INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD
// - Master sample (Project / Jenis Pekerjaan / Requester) — idempotent
// - SEED_DEMO=1 → tambah 1 akun freelancer demo
// Jalankan: npm run db:seed
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL || 'admin@notu.local'
  const password = process.env.INITIAL_ADMIN_PASSWORD || 'admin12345'

  const admin = await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Admin Notu',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'admin',
    },
  })
  console.log(`✔ Admin siap: ${admin.email}`)

  const projects = ['Website Revamp', 'Social Media Campaign']
  const workTypes = ['Desain', 'Development', 'Konten']
  const requesters = ['Klien Utama', 'Internal Tim']

  for (const name of projects) {
    await db.project.upsert({ where: { name }, update: {}, create: { name } })
  }
  for (const name of workTypes) {
    await db.workType.upsert({ where: { name }, update: {}, create: { name } })
  }
  for (const name of requesters) {
    await db.requester.upsert({
      where: { name },
      update: {},
      create: { name, creatorId: admin.id },
    })
  }
  console.log(`✔ Master sample siap: ${projects.length} project, ${workTypes.length} jenis pekerjaan, ${requesters.length} requester`)

  if (process.env.SEED_DEMO === '1') {
    const demoEmail = 'freelancer@notu.local'
    const freelancer = await db.user.upsert({
      where: { email: demoEmail },
      update: {},
      create: {
        email: demoEmail,
        name: 'Freelancer Demo',
        passwordHash: await bcrypt.hash('freelancer12345', 10),
        role: 'freelancer',
      },
    })
    console.log(`✔ Freelancer demo siap: ${freelancer.email} (password: freelancer12345)`)
  }

  console.log('\nSelesai. Catatan: akun admin memakai INITIAL_ADMIN_PASSWORD — ganti password setelah login pertama.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
