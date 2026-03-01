'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Socket } from 'socket.io-client'
import { PreJoinScreen } from '@/components/PreJoinScreen'
import { MeetingRoom } from '@/components/MeetingRoom'
import { getSocket } from '@/lib/socket'

type Phase = 'loading' | 'prejoin' | 'meeting'

export default function MeetingPage() {
  const params = useParams()
  const roomId = params.roomId as string

  const [phase, setPhase] = useState<Phase>('loading')
  const [userName, setUserName] = useState('')
  const [initialStream, setInitialStream] = useState<MediaStream | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)

  // Initialize Socket.io client (browser only)
  useEffect(() => {
    const s = getSocket()
    setSocket(s)
    setPhase('prejoin')

    // No cleanup — MeetingRoom handles disconnect on leave
  }, [])

  const handleJoin = (name: string, stream: MediaStream | null) => {
    setUserName(name)
    setInitialStream(stream)
    setPhase('meeting')
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (phase === 'loading' || !socket) {
    return (
      <div className="min-h-screen bg-[#202124] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[#8ab4f8] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#9aa0a6] text-sm">Connecting…</p>
        </div>
      </div>
    )
  }

  // ── Pre-join ─────────────────────────────────────────────────────────────
  if (phase === 'prejoin') {
    return <PreJoinScreen roomId={roomId} onJoin={handleJoin} />
  }

  // ── Meeting ──────────────────────────────────────────────────────────────
  return (
    <MeetingRoom
      roomId={roomId}
      userName={userName}
      socket={socket}
      initialStream={initialStream}
    />
  )
}
