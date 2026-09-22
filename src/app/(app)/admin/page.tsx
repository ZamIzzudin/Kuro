import { LayoutDashboard } from 'lucide-react'
import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Dashboard' }

export default function AdminDashboardPage() {
  return (
    <ComingSoon
      icon={LayoutDashboard}
      title="Dashboard Aktivitas"
      description="Live status siapa sedang clock in, activity feed, ringkasan jam, task per status, overdue, dan chart 30 hari — menyusul di Fase 4 (F4)."
      phase="Fase 4 · F4 Dashboard"
    />
  )
}
