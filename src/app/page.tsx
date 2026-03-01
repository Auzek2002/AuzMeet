'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Video, Link2, ChevronRight, Users, Shield, Zap } from 'lucide-react'

function generateRoomId(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  const alphanum = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const rand = (chars: string) => chars[Math.floor(Math.random() * chars.length)]
  const part1 = Array.from({ length: 3 }, () => rand(letters)).join('')
  const part2 = Array.from({ length: 4 }, () => rand(alphanum)).join('')
  const part3 = Array.from({ length: 3 }, () => rand(letters)).join('')
  return `${part1}-${part2}-${part3}`
}

export default function HomePage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')

  const handleNewMeeting = () => {
    const roomId = generateRoomId()
    router.push(`/meeting/${roomId}`)
  }

  const handleJoin = () => {
    const trimmed = code.trim().toLowerCase()
    if (!trimmed) {
      setCodeError('Please enter a meeting code or link')
      return
    }

    // Support pasting a full URL or just the code
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
    <div className="min-h-screen flex flex-col bg-white">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-[#1a73e8] rounded-xl flex items-center justify-center shadow-sm">
            <Video size={18} className="text-white" />
          </div>
          <span className="text-gray-700 text-xl font-semibold tracking-tight">
            AuzMeet
          </span>
        </div>
        <span className="text-gray-400 text-sm hidden sm:block">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </span>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center">
        <div className="max-w-6xl w-full mx-auto px-6 py-12 flex flex-col lg:flex-row items-center gap-16">
          {/* Left: CTA */}
          <div className="flex-1 max-w-lg">
            <h1 className="text-4xl lg:text-5xl font-normal text-gray-900 leading-tight mb-5">
              Video calls and meetings for everyone
            </h1>
            <p className="text-lg text-gray-600 mb-10">
              Connect, collaborate, and celebrate — from anywhere, with AuzMeet.
              Free video meetings with screen sharing and instant links.
            </p>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 items-start">
              {/* New meeting */}
              <button
                onClick={handleNewMeeting}
                className="flex items-center gap-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-full px-6 py-3 font-medium text-sm transition-colors shadow-sm whitespace-nowrap"
              >
                <Video size={16} />
                New meeting
              </button>

              {/* Join with code */}
              <div className="flex flex-col gap-1 flex-1 max-w-xs">
                <div className="flex rounded-full border border-gray-300 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 flex-1">
                    <Link2 size={15} className="text-gray-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value)
                        setCodeError('')
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                      placeholder="Enter a code or link"
                      className="outline-none text-gray-700 text-sm w-full min-w-0"
                    />
                  </div>
                  <button
                    onClick={handleJoin}
                    disabled={!code.trim()}
                    className="flex items-center gap-1 pr-4 pl-2 text-[#1a73e8] hover:text-[#1557b0] disabled:text-gray-400 disabled:cursor-not-allowed font-medium text-sm transition-colors whitespace-nowrap"
                  >
                    Join
                    <ChevronRight size={14} />
                  </button>
                </div>
                {codeError && (
                  <p className="text-red-500 text-xs px-2">{codeError}</p>
                )}
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                <span className="font-medium text-gray-700">How to use: </span>
                Click &quot;New meeting&quot; to start, then share the link with
                others.
              </p>
            </div>
          </div>

          {/* Right: Visual */}
          <div className="flex-1 flex justify-center lg:justify-end">
            <div className="relative">
              {/* Mock meeting grid */}
              <div className="w-80 h-56 bg-[#202124] rounded-2xl overflow-hidden shadow-2xl grid grid-cols-2 gap-1 p-1">
                {[
                  { name: 'Alex', color: '#4285f4' },
                  { name: 'Maria', color: '#34a853' },
                  { name: 'James', color: '#fbbc04' },
                  { name: 'Sara', color: '#ea4335' },
                ].map((p) => (
                  <div
                    key={p.name}
                    className="bg-[#3c4043] rounded-xl flex flex-col items-center justify-center gap-1 relative"
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                      style={{ backgroundColor: p.color + '44' }}
                    >
                      <span style={{ color: p.color }}>{p.name[0]}</span>
                    </div>
                    <span className="text-white text-xs opacity-70">{p.name}</span>
                  </div>
                ))}
              </div>
              {/* Controls bar mockup */}
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-[#202124] rounded-full px-4 py-2 flex gap-3 shadow-xl border border-[#3c4043]">
                {['#ef4444', '#3c4043', '#3c4043', '#3c4043'].map((bg, i) => (
                  <div
                    key={i}
                    className="w-7 h-7 rounded-full"
                    style={{ backgroundColor: bg }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section className="border-t border-gray-100 py-12 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
              <Video size={20} className="text-[#1a73e8]" />
            </div>
            <h3 className="font-medium text-gray-800">HD Video &amp; Audio</h3>
            <p className="text-sm text-gray-500">
              Crystal-clear video and audio with real-time peer-to-peer connections.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
              <Users size={20} className="text-green-600" />
            </div>
            <h3 className="font-medium text-gray-800">Screen Sharing</h3>
            <p className="text-sm text-gray-500">
              Share your screen, a window, or a browser tab instantly.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-yellow-50 rounded-full flex items-center justify-center">
              <Zap size={20} className="text-yellow-500" />
            </div>
            <h3 className="font-medium text-gray-800">Instant Links</h3>
            <p className="text-sm text-gray-500">
              Create a meeting in one click and share the link — no sign-in needed.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-gray-400">
          <span>© {new Date().getFullYear()} AuzMeet. Made by Azaan Nabi Khan</span>
          <div className="flex gap-4">
            <span>Privacy</span>
            <span>Terms</span>
            <span>About</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
