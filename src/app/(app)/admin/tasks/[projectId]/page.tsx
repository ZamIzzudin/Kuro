import type { Metadata } from 'next'
import { AdminProjectTasksClient } from './project-tasks-client'

export const metadata: Metadata = { title: 'Task Project' }

export default function AdminProjectTasksPage({ params }: { params: { projectId: string } }) {
  return <AdminProjectTasksClient projectId={params.projectId} />
}
