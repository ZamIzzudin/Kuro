import { FileSpreadsheet } from 'lucide-react'
import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Rekap & Export' }

export default function AdminReportsPage() {
  return (
    <ComingSoon
      icon={FileSpreadsheet}
      title="Rekap Jam Kerja Bulanan"
      description="Rekap per freelancer (per task/project/jenis pekerjaan/hari), export XLSX & PDF, dan lock periode — menyusul di Fase 5 (F5)."
      phase="Fase 5 · F5 Rekap & Export"
    />
  )
}
