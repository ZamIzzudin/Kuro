// Layout grup (app): butuh sesi aktif
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { getSessionUser, publicUser } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return <AppShell user={publicUser(user)}>{children}</AppShell>
}
