import type { Metadata, Viewport } from 'next'
import { Inter, Instrument_Serif, Space_Grotesk } from 'next/font/google'
import './globals.css'

/**
 * Three faces doing three jobs, which is what separates a designed page from a
 * styled one:
 *   Inter          - body copy and all UI, because it is boring in the right way
 *   Space Grotesk  - headings; geometric and slightly technical, so the product
 *                    reads as engineering rather than marketing
 *   Instrument Serif - italic accents only, for the one or two phrases that
 *                    should feel written rather than typeset
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: 'italic',
  variable: '--font-accent',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'AuzMeet: Video calls for everyone',
  description:
    'Free group video meetings with screen sharing, in-browser recording and AI meeting notes. No downloads, no account.',
  applicationName: 'AuzMeet',
  openGraph: {
    title: 'AuzMeet: Video calls for everyone',
    description:
      'Free group video meetings with screen sharing, in-browser recording and AI meeting notes. No downloads, no account.',
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
    <html
      lang="en"
      className={`bg-app ${inter.variable} ${spaceGrotesk.variable} ${instrumentSerif.variable}`}
    >
      <head>
        {/*
          Scroll-reveal starts elements at opacity 0 and JavaScript releases
          them. Without this guard, a failed or disabled script would leave the
          landing page blank rather than merely un-animated.
        */}
        <noscript>
          <style>{`.reveal { opacity: 1 !important; transform: none !important; }`}</style>
        </noscript>
      </head>
      <body className="bg-app text-primary font-body antialiased">{children}</body>
    </html>
  )
}
