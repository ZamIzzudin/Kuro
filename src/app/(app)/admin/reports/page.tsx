import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { ReportsClient } from './reports-client'

export const metadata = { title: 'Rekap & Export' }

export default async function AdminReportsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  // Rekap & Export khusus Admin — Project Manager tidak.
  if (user.role !== 'admin') redirect('/admin')
  return <ReportsClient />
}
