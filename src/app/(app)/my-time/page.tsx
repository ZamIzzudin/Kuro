import { Clock } from 'lucide-react'
import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Jam Kerja Saya' }

export default function MyTimePage() {
  return (
    <ComingSoon
      icon={Clock}
      title="Riwayat Jam Kerja"
      description="Riwayat time entry milik Anda per periode, lengkap dengan tombol ajukan koreksi — menyusul di Fase 5–6 (F5, F6)."
      phase="Fase 5–6 · F5 Rekap + F6 Koreksi"
    />
  )
}
