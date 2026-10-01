'use client'

import { useEffect, useRef } from 'react'
import { PeerState } from '@/types'

interface PeerAudioProps {
  peers: Map<string, PeerState>
  /** Output device id, when the browser supports setSinkId. */
  sinkId?: string
  volume?: number
}

interface AudioElementProps {
  stream: MediaStream | null
  sinkId?: string
  volume: number
}

function AudioOut({ stream, sinkId, volume }: AudioElementProps) {
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (element.srcObject !== stream) {
      element.srcObject = stream
      // Autoplay can be refused until the user interacts; joining counts, but
      // retry quietly rather than throwing.
      element.play().catch(() => {})
    }
  }, [stream])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.volume = volume
  }, [volume])

  useEffect(() => {
    const element = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null
    if (!element || !sinkId || typeof element.setSinkId !== 'function') return
    element.setSinkId(sinkId).catch(() => {})
  }, [sinkId])

  return <audio ref={ref} autoPlay playsInline />
}

/**
 * Audio is played here, once per participant, instead of inside the video tiles.
 * Tiles unmount as people page through the grid or a share takes over the
 * stage - this keeps everyone audible regardless of what is on screen.
 */
export function PeerAudio({ peers, sinkId, volume = 1 }: PeerAudioProps) {
  return (
    <div className="hidden" aria-hidden="true">
      {Array.from(peers.values()).map((peer) => (
        <div key={peer.socketId}>
          <AudioOut stream={peer.cameraStream} sinkId={sinkId} volume={volume} />
          {/* A shared screen can carry its own audio track. */}
          <AudioOut stream={peer.screenStream} sinkId={sinkId} volume={volume} />
        </div>
      ))}
    </div>
  )
}
