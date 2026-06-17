import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stance Health — Consent',
  description: 'Review and accept Stance Health policies',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
