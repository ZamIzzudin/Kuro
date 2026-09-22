import type { Metadata } from 'next'
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jono',
})

export const metadata: Metadata = {
  title: { default: 'Notu — Time & Task Tracker', template: '%s · Notu' },
  description: 'Clock in/out terikat task untuk tim freelancer — oleh dan untuk tim kecil.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={`${jakarta.variable} ${mono.variable} font-sans`}>{children}</body>
    </html>
  )
}
