'use client'

import { useEffect, useRef } from 'react'
import { MicOff, Hand } from 'lucide-react'
import { clsx } from 'clsx'

interface VideoTileProps {
  stream: MediaStream | null
  name: string
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isHandRaised?: boolean
  isLocal?: boolean
  mirror?: boolean    // override auto-mirror (defaults to isLocal)
  contain?: boolean   // use object-contain instead of object-cover (for screen share)
  className?: string
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((n) => n[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)
  return (
    <div className="w-20 h-20 rounded-full bg-[#5f6368] flex items-center justify-center text-white text-2xl font-medium select-none">
      {initials || '?'}
    </div>
  )
}

export function VideoTile({
  stream,
  name,
  isAudioEnabled,
  isVideoEnabled,
  isHandRaised = false,
  isLocal = false,
  mirror,
  contain = false,
  className = '',
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  const showVideo = !!stream && isVideoEnabled
  // mirror defaults to isLocal unless explicitly overridden (screen share passes mirror={false})
  const shouldMirror = mirror !== undefined ? mirror : isLocal

  return (
    <div
      className={clsx(
        'relative bg-[#3c4043] rounded-xl overflow-hidden flex items-center justify-center',
        className
      )}
    >
      {/* Video — always mounted so srcObject persists across camera toggles */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={clsx(
          'w-full h-full',
          contain ? 'object-contain' : 'object-cover',
          shouldMirror && 'scale-x-[-1]',
          !showVideo && 'hidden'
        )}
      />

      {/* Avatar shown as overlay when camera is off */}
      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar name={name} />
        </div>
      )}

      {/* Gradient overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

      {/* Name label */}
      <div className="absolute bottom-2 left-2">
        <span className="text-white text-sm font-medium drop-shadow-md">
          {isLocal ? `${name} (You)` : name}
        </span>
      </div>

      {/* Muted mic icon */}
      {!isAudioEnabled && (
        <div className="absolute bottom-2 right-2 bg-red-500/90 rounded-full p-1">
          <MicOff size={12} className="text-white" />
        </div>
      )}

      {/* Raised hand */}
      {isHandRaised && (
        <div className="absolute top-2 left-2 bg-yellow-400/90 rounded-full p-1.5 flex items-center gap-1">
          <Hand size={14} className="text-white" />
        </div>
      )}
    </div>
  )
}
