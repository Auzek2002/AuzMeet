'use client'

import { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  Check,
  Link2,
  Sparkles,
  Video,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Reveal, ScrollProgress, useScrolled } from '@/components/landing/motion'
import { Comparison, Faq, FeatureBento, HowItWorks } from '@/components/landing/sections'

// Three.js lives behind a dynamic import so it never blocks first paint.
const LightPillar = dynamic(() => import('@/components/LightPillar'), {
  ssr: false,
  loading: () => null,
})

function KickedBanner() {
  const searchParams = useSearchParams()
  if (searchParams.get('kicked') !== '1') return null
  return (
    <div className="relative z-50 flex items-center justify-center gap-2 bg-red-500/10 border-b border-red-500/20 px-4 py-3 text-red-300 text-sm">
      <AlertCircle size={15} className="flex-shrink-0" />
      You were removed from the meeting by the host.
    </div>
  )
}

function generateRoomId(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  const alphanum = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const rand = (chars: string) => chars[Math.floor(Math.random() * chars.length)]
  const part1 = Array.from({ length: 3 }, () => rand(letters)).join('')
  const part2 = Array.from({ length: 4 }, () => rand(alphanum)).join('')
  const part3 = Array.from({ length: 3 }, () => rand(letters)).join('')
  return `${part1}-${part2}-${part3}`
}

const PARTICIPANTS = [
  { name: 'Alex', color: '#a78bfa' },
  { name: 'Maria', color: '#34d399' },
  { name: 'James', color: '#fbbf24' },
  { name: 'Sara', color: '#fb7185' },
]

const MARQUEE = [
  'No downloads',
  'No account',
  'Up to 16 people',
  'HD screen sharing',
  'Local recording',
  'AI meeting notes',
  'Live transcript',
  'Catch-up briefs',
  'Host controls',
  'Peer-to-peer',
]


/** Rows deliberately phrased as capabilities, not slogans. */



export default function HomePage() {
  const router = useRouter()
  const scrolled = useScrolled(20)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')

  // Rendered only after mount: the server and the browser can sit in different
  // timezones, and a date baked into the HTML would mismatch on hydration.
  const [today, setToday] = useState('')
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    )
  }, [])

  const handleNewMeeting = () => {
    router.push(`/meeting/${generateRoomId()}`)
  }

  const handleJoin = () => {
    const trimmed = code.trim().toLowerCase()
    if (!trimmed) {
      setCodeError('Please enter a meeting code or link')
      return
    }
    let roomId = trimmed
    if (trimmed.includes('/meeting/')) {
      roomId = trimmed.split('/meeting/')[1]?.split(/[?#]/)[0] ?? trimmed
    }
    if (!roomId) {
      setCodeError('Invalid meeting code or link')
      return
    }
    router.push(`/meeting/${roomId}`)
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#06060f] text-white overflow-x-hidden">
      <ScrollProgress />

      <Suspense>
        <KickedBanner />
      </Suspense>

      {/* ── Header: transparent over the hero, solid once you scroll ── */}
      <header
        className={clsx(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
          scrolled
            ? 'backdrop-blur-xl bg-[#06060f]/80 border-b border-white/[0.08]'
            : 'bg-transparent border-b border-transparent'
        )}
      >
        <div className="w-full h-16 flex items-center justify-between px-4 md:px-10 max-w-7xl mx-auto">
          <a href="#top" className="flex items-center gap-2 group">
            <Image
              src="/AuzMeet_Logo.png"
              alt=""
              width={80}
              height={80}
              className="rounded-xl w-9 h-9 transition-transform duration-300 group-hover:scale-110"
            />
            <span className="font-display text-white text-lg md:text-xl font-semibold tracking-tight">
              AuzMeet
            </span>
          </a>

          <div className="flex items-center gap-2">
            <a
              href="#features"
              className="hidden md:block px-3 py-2 text-sm text-white/60 hover:text-white transition-colors"
            >
              Features
            </a>
            <a
              href="#compare"
              className="hidden md:block px-3 py-2 text-sm text-white/60 hover:text-white transition-colors"
            >
              Compare
            </a>
            <a
              href="https://github.com/Auzek2002/AuzMeet"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.12] text-white/85 hover:text-white hover:bg-white/[0.10] transition-all text-sm font-medium"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </div>
        </div>
      </header>

      {/* ══════════════ HERO ══════════════ */}
      <section
        id="top"
        className="relative min-h-[100svh] flex flex-col items-center justify-center px-5 sm:px-6 pt-28 pb-20 overflow-hidden"
      >
        <div className="absolute inset-0">
          <LightPillar
            topColor="#5227FF"
            bottomColor="#FF9FFC"
            intensity={1}
            rotationSpeed={0.2}
            glowAmount={0.002}
            pillarWidth={3}
            pillarHeight={0.4}
            noiseIntensity={0.3}
            pillarRotation={25}
            interactive={false}
            mixBlendMode="screen"
            quality="medium"
          />
        </div>

        {/* Drifting colour fields, layered under the vignette */}
        <div
          aria-hidden="true"
          className="aurora w-[22rem] h-[22rem] sm:w-[36rem] sm:h-[36rem] bg-violet-600/25 -top-24 -left-24"
        />
        <div
          aria-hidden="true"
          className="aurora w-[20rem] h-[20rem] sm:w-[30rem] sm:h-[30rem] bg-fuchsia-500/20 bottom-0 -right-16"
          style={{ animationDelay: '-8s' }}
        />

        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_50%,transparent_0%,#06060f_82%)] pointer-events-none" />

        <div className="relative z-10 w-full max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          {/* ── Left: the pitch ── */}
          <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left">
            <Reveal>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.12] text-sm text-white/70 mb-6 backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                Free · No sign-in required
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="font-display text-[2.6rem] sm:text-6xl xl:text-7xl font-bold tracking-[-0.03em] leading-[1.05] mb-5 sm:mb-6">
                <span
                  className="block text-white"
                  style={{ textShadow: '0 0 60px rgba(255,255,255,0.18)' }}
                >
                  Video calls that
                </span>
                <span className="block bg-gradient-to-r from-[#a78bfa] via-[#e879f9] to-[#fb7185] bg-clip-text text-transparent gradient-text pb-2">
                  take their own notes
                </span>
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="text-base sm:text-lg text-white/70 max-w-lg mb-8 leading-relaxed">
                Meet, share your screen, and record, then let AuzMeet write the summary
                and action items.{' '}
                <span className="font-accent text-white/90 text-lg sm:text-xl">
                  everything the others charge for,
                </span>{' '}
                free and in your browser.
              </p>
            </Reveal>

            <Reveal delay={240} className="w-full max-w-lg">
              <div className="flex flex-col gap-2 w-full">
                <div className="flex flex-col sm:flex-row items-stretch gap-3">
                  <button
                    onClick={handleNewMeeting}
                    className="shine group w-full sm:w-auto min-h-[52px] flex items-center justify-center gap-2.5 bg-gradient-to-r from-[#5227FF] to-[#9333ea] hover:from-[#6d3dff] hover:to-[#a855f7] text-white rounded-2xl px-7 py-4 font-semibold text-base transition-all duration-200 shadow-[0_0_40px_rgba(124,58,237,0.45)] hover:shadow-[0_0_60px_rgba(124,58,237,0.65)] hover:scale-[1.02] active:scale-[0.99] whitespace-nowrap flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#06060f]"
                  >
                    <Video size={18} />
                    New meeting
                    <ArrowRight
                      size={16}
                      className="transition-transform duration-200 group-hover:translate-x-1"
                    />
                  </button>

                  <div className="flex items-center flex-1 rounded-2xl bg-white/[0.08] border border-white/20 overflow-hidden backdrop-blur-sm hover:border-white/30 focus-within:border-violet-400/60 focus-within:bg-white/[0.10] focus-within:shadow-[0_0_20px_rgba(139,92,246,0.15)] transition-all duration-200">
                    <div className="flex items-center gap-2.5 px-4 py-4 flex-1 min-w-0">
                      <Link2 size={15} className="text-white/50 flex-shrink-0" />
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => {
                          setCode(e.target.value)
                          setCodeError('')
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                        placeholder="Enter a code or link"
                        aria-label="Meeting code or link"
                        className="outline-none bg-transparent text-white placeholder-white/50 text-sm font-medium w-full min-w-0"
                      />
                    </div>
                    <button
                      onClick={handleJoin}
                      disabled={!code.trim()}
                      className="flex items-center gap-1 mr-2 px-4 py-2.5 min-h-[40px] rounded-xl bg-violet-600/80 hover:bg-violet-500 disabled:bg-white/[0.06] disabled:text-white/25 text-white font-semibold text-sm transition-all duration-150 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      Join
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
                {codeError && (
                  <p role="alert" className="text-red-300 text-xs px-1 font-medium">
                    {codeError}
                  </p>
                )}
              </div>
            </Reveal>

            <Reveal delay={320}>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 mt-7 text-white/55 text-xs">
                {['No download', 'No account', 'Peer-to-peer', 'Open source'].map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <Check size={12} className="text-emerald-400" />
                    {item}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          {/* ── Right: product mock ── */}
          <Reveal delay={200} className="hidden lg:block flex-shrink-0 w-full max-w-md">
            <div className="relative float" aria-hidden="true">
              <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-violet-500/25 via-purple-500/10 to-pink-500/25 blur-xl" />
              <div className="relative bg-[#0d0d1a]/85 backdrop-blur-xl border border-white/[0.10] rounded-2xl overflow-hidden shadow-2xl shadow-purple-900/40">
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                  <span className="text-white/60 text-xs ml-2 font-mono">auzmeet · live</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-red-300/80 text-xs font-medium">REC</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-0.5 p-0.5">
                  {PARTICIPANTS.map((p, i) => (
                    <div
                      key={p.name}
                      className={clsx(
                        'relative bg-[#131325] aspect-video flex flex-col items-center justify-center gap-1.5 overflow-hidden',
                        i === 0 && 'ring-2 ring-violet-400/70 ring-inset'
                      )}
                    >
                      <div
                        className="absolute inset-0 opacity-25"
                        style={{
                          background: `radial-gradient(circle at 50% 60%, ${p.color}, transparent 70%)`,
                        }}
                      />
                      <div
                        className="relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ backgroundColor: `${p.color}22`, color: p.color }}
                      >
                        {p.name[0]}
                      </div>
                      <span className="relative text-white/60 text-xs">{p.name}</span>
                    </div>
                  ))}
                </div>

                {/* A hint of the notes panel, which is the actual differentiator */}
                <div className="px-3 py-2.5 border-t border-white/[0.06] bg-violet-500/[0.06]">
                  <p className="flex items-center gap-1.5 text-violet-300 text-[10px] font-semibold uppercase tracking-wide mb-1">
                    <Sparkles size={10} />
                    Auto notes
                  </p>
                  <p className="text-white/70 text-[11px] leading-relaxed">
                    Agreed to ship Thursday. Maria owns the migration script.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2.5 py-3.5 border-t border-white/[0.06] bg-white/[0.01]">
                  <div className="w-8 h-8 rounded-full bg-red-500/80 flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-sm" />
                  </div>
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-white/[0.08]" />
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════ MARQUEE ══════════════ */}
      <section className="relative border-y border-white/[0.06] bg-white/[0.015] py-4 overflow-hidden marquee">
        <div className="marquee-track gap-10">
          {[0, 1].map((half) => (
            <div key={half} className="flex gap-10 pr-10" aria-hidden={half === 1}>
              {MARQUEE.map((item) => (
                <span
                  key={item}
                  className="flex items-center gap-2.5 text-white/45 text-sm whitespace-nowrap"
                >
                  <span className="w-1 h-1 rounded-full bg-violet-400/70" />
                  {item}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <HowItWorks />
      <FeatureBento />
      <Comparison />
      <Faq />

      {/* ══════════════ FINAL CTA ══════════════ */}
      <section className="relative px-5 sm:px-6 py-20 sm:py-32 overflow-hidden border-t border-white/[0.05]">
        <div
          aria-hidden="true"
          className="aurora w-[24rem] h-[24rem] sm:w-[40rem] sm:h-[40rem] bg-violet-600/20 left-1/2 -translate-x-1/2 -top-32"
        />
        <Reveal className="relative max-w-2xl mx-auto text-center">
          <h2 className="font-display text-[2.4rem] sm:text-6xl font-bold tracking-[-0.03em] mb-5 leading-[1.07]">
            Start a meeting
            <br />
            <span className="font-accent bg-gradient-to-r from-violet-300 to-rose-300 bg-clip-text text-transparent">
              in one click
            </span>
          </h2>
          <p className="text-white/60 text-base sm:text-lg mb-9 max-w-md mx-auto leading-relaxed">
            No account, no download, no credit card. It works right now.
          </p>
          <button
            onClick={handleNewMeeting}
            className="shine group inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-[#5227FF] to-[#9333ea] hover:from-[#6d3dff] hover:to-[#a855f7] text-white rounded-2xl px-8 sm:px-9 py-4 w-full sm:w-auto min-h-[56px] font-semibold text-base sm:text-lg transition-all duration-200 shadow-[0_0_50px_rgba(124,58,237,0.5)] hover:shadow-[0_0_80px_rgba(124,58,237,0.7)] hover:scale-[1.03] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#06060f]"
          >
            <Video size={20} />
            New meeting
            <ArrowRight
              size={18}
              className="transition-transform duration-200 group-hover:translate-x-1"
            />
          </button>
        </Reveal>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className="border-t border-white/[0.06] py-8 px-5 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/55">
          <div className="flex items-center gap-2">
            <Image
              src="/AuzMeet_Logo.png"
              alt=""
              width={80}
              height={80}
              className="rounded-md w-5 h-5"
            />
            <span>© AuzMeet · Made by Azaan Nabi Khan</span>
            {today && <span className="hidden md:inline text-white/30">· {today}</span>}
          </div>
          <div className="flex gap-5">
            <a
              href="/diagnostics"
              className="hover:text-white transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              Connection test
            </a>
            <a
              href="https://github.com/Auzek2002/AuzMeet"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              Source
            </a>
            <a
              href="https://github.com/Auzek2002/AuzMeet/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              Report an issue
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
