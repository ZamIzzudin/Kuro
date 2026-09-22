import { Clock } from 'lucide-react'
import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Home' }

export default function FreelancerHomePage() {
  return (
    <ComingSoon
      icon={Clock}
      title="Widget Clock In / Out"
      description="Pilih task dari bucket, clock in, timer berjalan, switch task, dan clock out dengan activity note — menyusul di Fase 3 (F2)."
      phase="Fase 3 · F2 Clock In/Out"
    />
  )
}
