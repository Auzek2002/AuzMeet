'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Crown, Hand, Maximize, MicOff, Minimize, MonitorUp, Pin, PinOff, Radio } from 'lucide-react'
import { clsx } from 'clsx'
import { ConnectionQuality, Tile } from '@/types'

interface VideoTileProps {
  tile: Tile
  isSpeaking?: boolean
  level?: number
  isPinned?: boolean
  onTogglePin?: () => void
  /** Featured tiles letterbox their video so nothing is cropped away. */
  featured?: boolean
  compact?: boolean
  className?: string
}

function Avatar({ name, compact }: { name: string; compact?: boolean }) {
  const initials =
    name
      .split(/\s+/)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'

  return (
    <div
      className={clsx(
        'rounded-full bg-avatar flex items-center justify-center text-white font-medium select-none',
        compact ? 'w-10 h-10 text-sm' : 'w-16 h-16 sm:w-20 sm:h-20 text-xl sm:text-2xl'
      )}
    >
      {initials}
    </div>
  )
}

const QUALITY_BARS: Record<ConnectionQuality, { bars: number; color: string; label: string }> = {
  excellent: { bars: 3, color: 'bg-emerald-400', label: 'Strong connection' },
  good: { bars: 2, color: 'bg-amber-400', label: 'Moderate connection' },
  poor: { bars: 1, color: 'bg-red-400', label: 'Weak connection' },
  connecting: { bars: 0, color: 'bg-muted', label: 'Connecting…' },
  lost: { bars: 0, color: 'bg-red-500', label: 'Connection lost' },
}

function QualityIndicator({ quality }: { quality: ConnectionQuality }) {
  const spec = QUALITY_BARS[quality]
  return (
    <div className="flex items-end gap-[2px] h-3" title={spec.label}>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={clsx(
            'w-[3px] rounded-sm transition-colors',
            index === 0 ? 'h-1.5' : index === 1 ? 'h-2.5' : 'h-3',
            index < spec.bars ? spec.color : 'bg-white/25'
          )}
        />
      ))}
    </div>
  )
}

export function VideoTile({
  tile,
  isSpeaking = false,
  level = 0,
  isPinned = false,
  onTogglePin,
  featured = false,
  compact = false,
  className = '',
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isTrackLive, setIsTrackLive] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const { stream, kind, name, isLocal } = tile
  const isScreen = kind === 'screen'

  // Bind the stream and follow the video track's mute state. Remote tracks stay
  // muted until media really flows, so this is what tells us whether there is
  // anything to show yet.
  //
  // A remote stream gains its tracks one at a time as they arrive, and the
  // stream object itself never changes identity — so we re-bind on addtrack
  // rather than assuming the video track is present on the first pass.
  useEffect(() => {
    const element = videoRef.current
    if (!element) return

    if (element.srcObject !== stream) {
      element.srcObject = stream
      if (stream) element.play().catch(() => {})
    }

    if (!stream) {
      setIsTrackLive(false)
      return
    }

    let bound: MediaStreamTrack | null = null
    const onUnmute = () => setIsTrackLive(true)
    const onMute = () => setIsTrackLive(false)
    const onEnded = () => setIsTrackLive(false)

    const unbind = () => {
      if (!bound) return
      bound.removeEventListener('unmute', onUnmute)
      bound.removeEventListener('mute', onMute)
      bound.removeEventListener('ended', onEnded)
      bound = null
    }

    const bind = () => {
      const track = stream.getVideoTracks()[0] ?? null
      if (track === bound) {
        if (track) setIsTrackLive(!track.muted && track.readyState === 'live')
        return
      }
      unbind()
      if (!track) {
        setIsTrackLive(false)
        return
      }
      bound = track
      setIsTrackLive(!track.muted && track.readyState === 'live')
      track.addEventListener('unmute', onUnmute)
      track.addEventListener('mute', onMute)
      track.addEventListener('ended', onEnded)
    }

    bind()
    stream.addEventListener('addtrack', bind)
    stream.addEventListener('removetrack', bind)

    return () => {
      stream.removeEventListener('addtrack', bind)
      stream.removeEventListener('removetrack', bind)
      unbind()
    }
  }, [stream])

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const element = containerRef.current
    if (!element) return
    if (document.fullscreenElement === element) {
      void document.exitFullscreen()
    } else {
      void element.requestFullscreen?.().catch(() => {})
    }
  }, [])

  // The local preview always has live frames; remote tiles wait for real media.
  const hasFrames = isLocal ? !!stream : isTrackLive
  const showVideo = hasFrames && (isScreen || tile.isVideoEnabled)
  const showControls = !compact

  return (
    <div
      ref={containerRef}
      className={clsx(
        'group relative rounded-xl overflow-hidden flex items-center justify-center transition-shadow duration-150',
        isScreen ? 'bg-black' : 'bg-elevated',
        isSpeaking && !isScreen && 'ring-2 ring-accent',
        className
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        // Audio is played by a dedicated element per participant so it keeps
        // working when a tile is off-screen or on another grid page.
        muted
        // A second, independent signal: real dimensions mean real frames, which
        // covers any mute event that landed before we were listening.
        onLoadedMetadata={(event) => {
          if (event.currentTarget.videoWidth > 0) setIsTrackLive(true)
        }}
        onResize={(event) => {
          if (event.currentTarget.videoWidth > 0) setIsTrackLive(true)
        }}
        onPlaying={(event) => {
          if (event.currentTarget.videoWidth > 0) setIsTrackLive(true)
        }}
        className={clsx(
          'w-full h-full',
          isScreen || featured ? 'object-contain' : 'object-cover',
          isLocal && !isScreen && 'scale-x-[-1]',
          !showVideo && 'invisible'
        )}
      />

      {!showVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Avatar name={name} compact={compact} />
          {!isLocal && tile.quality === 'connecting' && !compact && (
            <span className="text-muted text-xs">Connecting…</span>
          )}
        </div>
      )}

      {/* Bottom gradient keeps labels readable over any content. */}
      <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* Name + state */}
      <div className="absolute bottom-1.5 left-2 right-2 flex items-center gap-1.5 min-w-0">
        {!tile.isAudioEnabled && !isScreen && (
          <span className="flex-shrink-0 bg-red-500/90 rounded-full p-0.5">
            <MicOff size={compact ? 9 : 11} className="text-white" />
          </span>
        )}
        {tile.isAudioEnabled && !isScreen && isSpeaking && (
          // Simple level meter, so who is talking is obvious at a glance.
          <span className="flex-shrink-0 flex items-end gap-[2px] h-3">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="w-[3px] bg-accent rounded-sm transition-all duration-100"
                style={{
                  height: `${Math.max(38, Math.min(100, level * 100 * (index === 1 ? 1.3 : 0.9)))}%`,
                }}
              />
            ))}
          </span>
        )}

        <span
          className={clsx(
            'text-white font-medium drop-shadow-md truncate',
            compact ? 'text-[11px]' : 'text-xs sm:text-sm'
          )}
        >
          {isScreen
            ? `${isLocal ? 'Your' : `${name}'s`} screen`
            : isLocal
            ? `${name} (You)`
            : name}
        </span>

        {tile.isHost && !isScreen && (
          <span title="Host" className="flex-shrink-0">
            <Crown size={compact ? 9 : 11} className="text-yellow-400" />
          </span>
        )}

        {!isLocal && !compact && (
          <span className="ml-auto flex-shrink-0">
            <QualityIndicator quality={tile.quality} />
          </span>
        )}
      </div>

      {/* Top-left status badges */}
      <div className="absolute top-2 left-2 flex items-center gap-1.5">
        {tile.isHandRaised && !isScreen && (
          <span
            title={`${name} raised their hand`}
            className="bg-yellow-400 rounded-full p-1 flex items-center shadow-lg"
          >
            <Hand size={compact ? 10 : 13} className="text-app" />
          </span>
        )}
        {isScreen && !compact && (
          <span className="flex items-center gap-1 bg-accent text-app text-[10px] font-semibold rounded-md px-1.5 py-0.5">
            <MonitorUp size={10} />
            Presenting
          </span>
        )}
        {tile.isRecording && !isScreen && (
          <span
            title={`${name} is recording`}
            className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-semibold rounded-md px-1.5 py-0.5"
          >
            <Radio size={10} />
            REC
          </span>
        )}
      </div>

      {/* Hover / tap actions */}
      {showControls && (
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-70 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {onTogglePin && (
            <button
              onClick={onTogglePin}
              title={isPinned ? 'Unpin' : 'Pin to stage'}
              className="bg-black/60 hover:bg-black/80 text-white rounded-lg p-1.5 touch-manipulation"
            >
              {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className="bg-black/60 hover:bg-black/80 text-white rounded-lg p-1.5 touch-manipulation"
          >
            {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
          </button>
        </div>
      )}
    </div>
  )
}
