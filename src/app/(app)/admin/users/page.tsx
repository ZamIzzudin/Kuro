import { Users } from 'lucide-react'
import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'User' }

export default function AdminUsersPage() {
  return (
    <ComingSoon
      icon={Users}
      title="Kelola User"
      description="Buat akun admin/freelancer, aktif/nonaktif, dan reset password — menyusul di Fase 1."
      phase="Fase 1 · Masters & User"
    />
  )
}
