import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { UsersClient } from './users-client'

export const metadata: Metadata = { title: 'User' }

export default async function AdminUsersPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  // Manajemen user khusus Admin — Project Manager tidak.
  if (user.role !== 'admin') redirect('/admin')
  return <UsersClient />
}
