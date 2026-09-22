import type { Metadata } from 'next'
import { MastersClient } from './masters-client'

export const metadata: Metadata = { title: 'Master' }

export default function AdminMastersPage() {
  return <MastersClient />
}
