import type { Metadata } from 'next'
import { ProjectsAdminClient } from './projects-client'

export const metadata: Metadata = { title: 'Project' }

export default function AdminProjectsPage() {
  return <ProjectsAdminClient />
}
