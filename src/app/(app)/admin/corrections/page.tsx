import { ClipboardCheck } from 'lucide-react'
import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Review Koreksi' }

export default function AdminCorrectionsPage() {
  return (
    <ComingSoon
      icon={ClipboardCheck}
      title="Review Koreksi Time Entry"
      description="Setujui/tolak pengajuan koreksi dengan tampilan diff nilai lama vs baru, plus edit langsung oleh admin (ter-audit) — menyusul di Fase 6 (F6)."
      phase="Fase 6 · F6 Koreksi"
    />
  )
}
