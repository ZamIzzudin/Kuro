// Halaman root: arahkan sesuai sesi & role
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { hasAdminAccess } from '@/lib/roles'

export default async function RootPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  redirect(hasAdminAccess(user.role) ? '/admin' : '/home')
}
