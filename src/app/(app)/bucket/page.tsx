import type { Metadata } from 'next'
import { BucketClient } from './bucket-client'

export const metadata: Metadata = { title: 'Task Bucket' }

export default function BucketPage() {
  return <BucketClient />
}
