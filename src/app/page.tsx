'use client'

import { Suspense, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Video,
  Link2,
  ChevronRight,
  Users,
  Zap,
  AlertCircle,
  Monitor,
  Sparkles,
} from 'lucide-react'

// Load Three.js-based LightPillar only on the client (no SSR)
const LightPillar = dynamic(() => import('@/components/LightPillar'), {
  ssr: false,
  loading: () => null,
})

function KickedBanner() {
  const searchParams = useSearchParams()
  if (searchParams.get('kicked') !== '1') return null
  return (
    <div className="relative z-50 flex items-center justify-center gap-2 bg-red-500/10 border-b border-red-500/20 px-4 py-3 text-red-400 text-sm">
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
  { name: 'Alex', color: '#818cf8' },
  { name: 'Maria', color: '#34d399' },
  { name: 'James', color: '#fbbf24' },
  { name: 'Sara', color: '#f87171' },
]

const FEATURES = [
  {
    icon: <Video size={20} className="text-violet-400" />,
    iconBg: 'bg-violet-500/10 ring-1 ring-violet-500/20',
    title: 'HD Video & Audio',
    desc: 'Crystal-clear video and audio with real-time peer-to-peer WebRTC connections.',
  },
  {
    icon: <Monitor size={20} className="text-pink-400" />,
    iconBg: 'bg-pink-500/10 ring-1 ring-pink-500/20',
    title: 'Screen Sharing',
    desc: 'Share your screen, a window, or a browser tab instantly with one click.',
  },
  {
    icon: <Zap size={20} className="text-indigo-400" />,
    iconBg: 'bg-indigo-500/10 ring-1 ring-indigo-500/20',
    title: 'Instant Links',
    desc: 'Create a meeting in one click and share the link — no sign-in needed.',
  },
]

export default function HomePage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')

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
      {/* ── Kicked banner ── */}
      <Suspense>
        <KickedBanner />
      </Suspense>

      {/* ── Fixed glass header ── */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-white/[0.02] border-b border-white/[0.06]">
        <div className="w-full h-16 flex items-center justify-between px-4 md:px-10 overflow-hidden">
        <div className="flex items-center gap-1.5">
          <Image src="/AuzMeet_Logo.png" alt="AuzMeet" width={80} height={80} className="rounded-xl w-9 h-9 md:w-[52px] md:h-[52px]" />
          <span className="text-white text-lg md:text-xl font-semibold tracking-tight">AuzMeet</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/Auzek2002/AuzMeet"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.12] text-white/70 hover:text-white hover:bg-white/[0.10] transition-all text-sm font-medium"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span className="hidden sm:inline">Go to repo</span>
          </a>
          <span className="text-white/25 text-sm hidden sm:block">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </span>
        </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16 overflow-hidden">
        {/* LightPillar atmospheric background */}
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

        {/* Vignette — darker at edges, lighter in the middle so both columns are visible */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_50%,transparent_0%,#06060f_80%)] pointer-events-none" />

        {/* ── Two-column hero ── */}
        <div className="relative z-10 w-full max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

          {/* ── Left: text + CTA ── */}
          <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.10] text-sm text-white/50 mb-5 backdrop-blur-sm">
              <Sparkles size={13} className="text-purple-400" />
              Free · No sign-in required
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-6xl xl:text-7xl font-black tracking-tight leading-[1.08] mb-5">
              {/* First line — crisp white with subtle glow */}
              <span
                className="block text-white"
                style={{ textShadow: '0 0 60px rgba(255,255,255,0.18)' }}
              >
                Video calls and
              </span>
              {/* Gradient line — vibrant and luminous */}
              <span
                className="block bg-gradient-to-r from-[#a78bfa] via-[#d946ef] to-[#fb7185] bg-clip-text text-transparent pb-2"
                style={{ filter: 'drop-shadow(0 0 32px rgba(167,139,250,0.55))' }}
              >
                meetings for everyone
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-white/55 max-w-md mb-8 leading-relaxed font-medium">
              Connect, collaborate, and celebrate from anywhere, with AuzMeet.
              Free video meetings with screen sharing and instant links.
            </p>

            {/* CTA — single row: New Meeting + code input side by side */}
            <div className="flex flex-col gap-2 w-full max-w-lg">
              <div className="flex flex-col sm:flex-row items-stretch gap-3">
                {/* New meeting */}
                <button
                  onClick={handleNewMeeting}
                  className="flex items-center justify-center gap-2.5 bg-gradient-to-r from-[#5227FF] to-[#7c3aed] hover:from-[#6d3dff] hover:to-[#9333ea] text-white rounded-2xl px-6 py-4 font-bold text-base transition-all duration-200 shadow-[0_0_40px_rgba(124,58,237,0.45)] hover:shadow-[0_0_60px_rgba(124,58,237,0.6)] hover:scale-[1.02] active:scale-[0.99] whitespace-nowrap flex-shrink-0"
                >
                  <Video size={18} />
                  New meeting
                </button>

                {/* Code input */}
                <div className="flex items-center flex-1 rounded-2xl bg-white/[0.08] border border-white/20 overflow-hidden backdrop-blur-sm hover:border-white/30 focus-within:border-violet-400/60 focus-within:bg-white/[0.10] focus-within:shadow-[0_0_20px_rgba(139,92,246,0.15)] transition-all duration-200">
                  <div className="flex items-center gap-2.5 px-4 py-4 flex-1 min-w-0">
                    <Link2 size={15} className="text-white/40 flex-shrink-0" />
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value)
                        setCodeError('')
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                      placeholder="Enter a code or link"
                      className="outline-none bg-transparent text-white placeholder-white/35 text-sm font-medium w-full min-w-0"
                    />
                  </div>
                  <button
                    onClick={handleJoin}
                    disabled={!code.trim()}
                    className="flex items-center gap-1 mr-2 px-4 py-2 rounded-xl bg-violet-600/80 hover:bg-violet-500 disabled:bg-white/[0.06] disabled:text-white/25 text-white font-semibold text-sm transition-all duration-150 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0"
                  >
                    Join
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
              {codeError && (
                <p className="text-red-400 text-xs px-1 font-medium">{codeError}</p>
              )}
            </div>
          </div>

          {/* ── Right: meeting preview card (desktop only) ── */}
          <div className="hidden lg:block flex-shrink-0 w-full max-w-sm lg:max-w-md">
            {/* Outer glow ring */}
            <div className="relative">
              <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-violet-500/20 via-purple-500/10 to-pink-500/20 blur-xl" />
              <div className="relative bg-[#0d0d1a]/80 backdrop-blur-xl border border-white/[0.10] rounded-2xl overflow-hidden shadow-2xl shadow-purple-900/30">
                {/* Window chrome */}
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                  <span className="text-white/25 text-xs ml-2 font-mono">AuzMeet · live</span>
                  {/* Live indicator */}
                  <div className="ml-auto flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-green-400/70 text-xs font-medium">Live</span>
                  </div>
                </div>

                {/* 2×2 participant grid */}
                <div className="grid grid-cols-2 gap-0.5 p-0.5">
                  {PARTICIPANTS.map((p) => (
                    <div
                      key={p.name}
                      className="relative bg-[#131325] aspect-video flex flex-col items-center justify-center gap-1.5 overflow-hidden"
                    >
                      <div
                        className="absolute inset-0 opacity-20"
                        style={{
                          background: `radial-gradient(circle at 50% 60%, ${p.color}, transparent 70%)`,
                        }}
                      />
                      <div
                        className="relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ backgroundColor: p.color + '22', color: p.color }}
                      >
                        {p.name[0]}
                      </div>
                      <span className="relative text-white/40 text-xs">{p.name}</span>
                    </div>
                  ))}
                </div>

                {/* Mock control bar */}
                <div className="flex items-center justify-center gap-2.5 py-3.5 border-t border-white/[0.05] bg-white/[0.01]">
                  <div className="w-8 h-8 rounded-full bg-red-500/80 flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-sm" />
                  </div>
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-white/[0.08]" />
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative px-6 py-28 border-t border-white/[0.05]">
        {/* Subtle background noise texture */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_60%_at_50%_0%,rgba(82,39,255,0.06),transparent_60%)] pointer-events-none" />

        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">Everything you need</h2>
            <p className="text-white/35 text-base">
              No downloads. No accounts. Just click and meet.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-8 hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-300"
              >
                {/* Subtle corner gradient on hover */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.03),transparent_60%)]" />

                <div
                  className={`relative w-11 h-11 ${f.iconBg} rounded-xl flex items-center justify-center mb-5`}
                >
                  {f.icon}
                </div>
                <h3 className="relative font-semibold text-white mb-2 text-base">{f.title}</h3>
                <p className="relative text-sm text-white/35 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Stats row */}
          <div className="mt-16 grid grid-cols-3 gap-4 border-t border-white/[0.05] pt-16">
            {[
              { value: '100%', label: 'Free forever' },
              { value: 'P2P', label: 'Direct connection' },
              { value: '0', label: 'Accounts needed' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent mb-1">
                  {stat.value}
                </div>
                <div className="text-white/30 text-xs sm:text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.05] py-6 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/20">
          <div className="flex items-center gap-2">
            <Image src="/AuzMeet_Logo.png" alt="AuzMeet" width={80} height={80} className="rounded-md" />
            <span>© {new Date().getFullYear()} AuzMeet · Made by Azaan Nabi Khan</span>
          </div>
          <div className="flex gap-5">
            {['Privacy', 'Terms', 'About'].map((link) => (
              <span
                key={link}
                className="hover:text-white/40 cursor-pointer transition-colors"
              >
                {link}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
