import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AuzMeet — Video calls for everyone',
  description:
    'Free group video meetings with screen sharing and in-browser recording. No downloads, no account.',
  applicationName: 'AuzMeet',
  openGraph: {
    title: 'AuzMeet — Video calls for everyone',
    description:
      'Free group video meetings with screen sharing and in-browser recording. No downloads, no account.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a14',
  width: 'device-width',
  initialScale: 1,
  // A meeting UI is full-height chrome; letting it zoom breaks the layout, but
  // the cap stays high enough not to block people who need to magnify.
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="bg-app">
      <body className={`${inter.className} bg-app text-primary`}>{children}</body>
    </html>
  )
}
