import type { Metadata } from 'next'
import { AdminProjectsClient } from './projects-client'

export const metadata: Metadata = { title: 'Task' }

export default function AdminTasksPage() {
  return <AdminProjectsClient />
}
