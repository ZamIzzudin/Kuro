import { Database } from 'lucide-react'
import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Master Data' }

export default function AdminMastersPage() {
  return (
    <ComingSoon
      icon={Database}
      title="Master Data"
      description="Kelola master Project, Jenis Pekerjaan, dan Requester (termasuk tambah requester baru — khusus Admin) — menyusul di Fase 1."
      phase="Fase 1 · Masters & User"
    />
  )
}
