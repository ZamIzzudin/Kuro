// Notu — persiapan data untuk E2E: pastikan ada task yang bisa dikerjakan freelancer.
// Dibersihkan kembali oleh global-teardown setelah test selesai.
import { PrismaClient } from '@prisma/client'

const TITLE = 'Task Uji E2E'
const db = new PrismaClient()

export default async function globalSetup() {
  const freelancer = await db.user.findFirst({ where: { email: 'freelancer@notu.local' } })
  const admin = await db.user.findFirst({ where: { email: 'admin@notu.local' } })
  if (!freelancer || !admin) throw new Error('User demo belum di-seed. Jalankan npm run db:seed.')

  const project = await db.project.findFirstOrThrow()
  const workType = await db.workType.findFirstOrThrow()
  const requester = await db.requester.findFirstOrThrow()

  // Bersihkan sisa run sebelumnya
  await db.correctionRequest.deleteMany({ where: { timeEntry: { task: { title: TITLE } } } })
  await db.timeEntry.deleteMany({ where: { task: { title: TITLE } } })
  await db.task.deleteMany({ where: { title: { in: [TITLE, `${TITLE} 2`] } } })

  const deadline = new Date(Date.now() + 7 * 86_400_000)
  for (const title of [TITLE, `${TITLE} 2`]) {
    await db.task.create({
      data: {
        title,
        projectId: project.id,
        workTypeId: workType.id,
        requesterId: requester.id,
        priority: 'medium',
        estimatedHours: 4,
        requestDate: new Date(),
        deadlineAt: deadline,
        createdById: admin.id,
      },
    })
  }

  await db.$disconnect()
}
