import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { AdminCorrectionsClient } from './corrections-client'

export const metadata = { title: 'Review Koreksi' }

export default async function AdminCorrectionsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  // Review koreksi khusus Admin — Project Manager tidak.
  if (user.role !== 'admin') redirect('/admin')
  return <AdminCorrectionsClient />
}
