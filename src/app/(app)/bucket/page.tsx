import { Inbox } from 'lucide-react'
import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Task Bucket' }

export default function BucketPage() {
  return (
    <ComingSoon
      icon={Inbox}
      title="Task Bucket (To Do List)"
      description="Task yang di-assign ke Anda + task unassigned yang bisa diambil, dengan filter dan group-by — menyusul di Fase 2 (F1)."
      phase="Fase 2 · F1 Task Bucket"
    />
  )
}
