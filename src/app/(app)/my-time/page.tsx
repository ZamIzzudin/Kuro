import type { Metadata } from 'next'
import { MyTimeClient } from './my-time-client'

export const metadata: Metadata = { title: 'Jam Kerja Saya' }

export default function MyTimePage() {
  return <MyTimeClient />
}
