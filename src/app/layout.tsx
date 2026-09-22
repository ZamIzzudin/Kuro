import type { Metadata } from 'next'
import { DM_Sans, Figtree, JetBrains_Mono } from 'next/font/google'
import './globals.css'

// Font (keputusan user): heading = DM Sans, body = Figtree, mono = JetBrains Mono
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-heading',
})

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-body',
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
      <body className={`${dmSans.variable} ${figtree.variable} ${mono.variable} font-sans`}>
        {children}
      </body>
    </html>
  )
}
