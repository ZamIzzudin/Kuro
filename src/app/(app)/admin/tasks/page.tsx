import { ListChecks } from 'lucide-react'
import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Task' }

export default function AdminTasksPage() {
  return (
    <ComingSoon
      icon={ListChecks}
      title="Kelola Task"
      description="Create task (project, jenis pekerjaan, requester, deadline, prioritas), assign/re-assign, dan alur status task — menyusul di Fase 2 (F1, F3)."
      phase="Fase 2 · F1 + F3 Task"
    />
  )
}
