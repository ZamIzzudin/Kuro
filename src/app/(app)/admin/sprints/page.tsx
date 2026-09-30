import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SprintsClient } from './sprints-client'

export const metadata: Metadata = { title: 'Sprint' }

export default function AdminSprintsPage() {
  return (
    <Suspense>
      <SprintsClient />
    </Suspense>
  )
}
