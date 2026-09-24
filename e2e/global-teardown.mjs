// Notu — bersihkan data uji E2E setelah test selesai.
import { PrismaClient } from '@prisma/client'

const TITLE = 'Task Uji E2E'
const db = new PrismaClient()

export default async function globalTeardown() {
  const tasks = await db.task.findMany({
    where: { title: { in: [TITLE, `${TITLE} 2`] } },
    select: { id: true },
  })
  const taskIds = tasks.map((t) => t.id)
  if (taskIds.length) {
    const entries = await db.timeEntry.findMany({ where: { taskId: { in: taskIds } }, select: { id: true } })
    const entryIds = entries.map((e) => e.id)
    await db.correctionRequest.deleteMany({
      where: { OR: [{ timeEntryId: { in: entryIds } }, { reason: { contains: 'seharusnya' } }] },
    })
    await db.timeEntry.deleteMany({ where: { id: { in: entryIds } } })
    await db.activityLog.deleteMany({ where: { entityType: 'correction' } })
    await db.activityLog.deleteMany({
      where: { OR: [{ entityId: { in: taskIds } }, { description: { contains: TITLE } }] },
    })
    await db.task.deleteMany({ where: { id: { in: taskIds } } })
  }
  await db.$disconnect()
}
