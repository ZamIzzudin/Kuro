import { ClipboardCheck } from 'lucide-react'
import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Koreksi Saya' }

export default function MyCorrectionsPage() {
  return (
    <ComingSoon
      icon={ClipboardCheck}
      title="Pengajuan Koreksi Time Entry"
      description="Lupa clock out atau salah task? Ajukan koreksi dengan alasan dan pantau status persetujuannya — menyusul di Fase 6 (F6)."
      phase="Fase 6 · F6 Koreksi"
    />
  )
}
