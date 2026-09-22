import type { Metadata } from 'next'
import { UsersClient } from './users-client'

export const metadata: Metadata = { title: 'User' }

export default function AdminUsersPage() {
  return <UsersClient />
}
