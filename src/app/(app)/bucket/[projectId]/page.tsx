import type { Metadata } from 'next'
import { ProjectTasksClient } from './project-tasks-client'

export const metadata: Metadata = { title: 'Task Project' }

export default function BucketProjectPage({ params }: { params: { projectId: string } }) {
  return <ProjectTasksClient projectId={params.projectId} />
}
