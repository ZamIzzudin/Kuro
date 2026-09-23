import type { Metadata } from 'next'
import { TasksClient } from './tasks-client'

export const metadata: Metadata = { title: 'Task' }

export default function AdminTasksPage() {
  return <TasksClient />
}
