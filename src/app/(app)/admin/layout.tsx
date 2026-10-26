// Layout /admin: untuk Admin & Project Manager (dicek server-side, bukan hanya UI)
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { hasAdminAccess } from '@/lib/roles'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (!hasAdminAccess(user.role)) redirect('/home')
  return <>{children}</>
}
