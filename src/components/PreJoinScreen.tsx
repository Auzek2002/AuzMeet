'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Mic, MicOff, Video, VideoOff, Settings } from 'lucide-react'

interface PreJoinScreenProps {
  roomId: string
  onJoin: (name: string, stream: MediaStream | null) => void
}

export function PreJoinScreen({ roomId, onJoin }: PreJoinScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [hasStream, setHasStream] = useState(false)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [name, setName] = useState('')
  const [mediaError, setMediaError] = useState<string | null>(null)

  // Acquire camera + mic on mount
  useEffect(() => {
    let active = true

    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        })
        if (!active) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        setHasStream(true)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch (err) {
        console.warn('[PreJoin] getUserMedia failed:', err)
        setMediaError(
          'Camera or microphone not found. You can still join without them.'
        )
      } finally {
        if (active) setIsLoading(false)
      }
    }

    getMedia()

    return () => {
      active = false
      // Do NOT stop tracks here — they are passed to MeetingRoom
    }
  }, [])

  const toggleAudio = useCallback(() => {
    if (!streamRef.current) return
    streamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled
    })
    setIsAudioEnabled((prev) => !prev)
  }, [])

  const toggleVideo = useCallback(() => {
    if (!streamRef.current) return
    streamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled
    })
    setIsVideoEnabled((prev) => !prev)
  }, [])

  const handleJoin = useCallback(() => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    onJoin(trimmedName, streamRef.current)
  }, [name, onJoin])

  const initials = name.trim().slice(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-[#202124] flex flex-col items-center justify-center px-4 py-8">
      {/* AuzMeet branding */}
      <div className="mb-8 flex items-center gap-2">
        <div className="w-7 h-7 bg-[#1a73e8] rounded-md flex items-center justify-center">
          <Video size={16} className="text-white" />
        </div>
        <span className="text-white text-lg font-medium">AuzMeet</span>
      </div>

      <div className="max-w-3xl w-full flex flex-col md:flex-row gap-8 items-center">
        {/* ── Camera preview ───────────────────────────────────────────── */}
        <div className="flex-1 max-w-md w-full">
          <div className="relative bg-[#3c4043] rounded-2xl overflow-hidden aspect-video shadow-2xl">
            {/* Loading spinner */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-[#8ab4f8] border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Live video preview */}
            {hasStream && isVideoEnabled ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              !isLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 rounded-full bg-[#5f6368] flex items-center justify-center text-white text-3xl font-medium select-none">
                    {initials || '?'}
                  </div>
                </div>
              )
            )}

            {/* Camera/mic toggles overlay */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
              <button
                onClick={toggleAudio}
                title={isAudioEnabled ? 'Mute' : 'Unmute'}
                className={`p-3 rounded-full transition-colors ${
                  isAudioEnabled
                    ? 'bg-[#3c4043]/80 text-white hover:bg-[#5f6368]/80'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <button
                onClick={toggleVideo}
                title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
                className={`p-3 rounded-full transition-colors ${
                  isVideoEnabled
                    ? 'bg-[#3c4043]/80 text-white hover:bg-[#5f6368]/80'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
            </div>
          </div>

          {mediaError && (
            <p className="text-yellow-400 text-sm mt-3 text-center px-2">
              {mediaError}
            </p>
          )}
        </div>

        {/* ── Join panel ────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-5 max-w-xs w-full">
          <div className="text-center">
            <h1 className="text-white text-2xl font-medium mb-1">Ready to join?</h1>
            <p className="text-[#9aa0a6] text-sm">
              {isLoading ? 'Checking camera & microphone…' : 'Set up your audio and video before joining.'}
            </p>
          </div>

          {/* Name input */}
          <div className="w-full">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="Your name"
              maxLength={50}
              autoFocus
              className="w-full bg-transparent border border-[#5f6368] focus:border-[#8ab4f8] rounded-lg px-4 py-3 text-white placeholder-[#9aa0a6] outline-none transition-colors"
            />
          </div>

          {/* Join button */}
          <button
            onClick={handleJoin}
            disabled={!name.trim()}
            className="w-full bg-[#8ab4f8] hover:bg-[#a8c7fa] disabled:bg-[#5f6368] disabled:cursor-not-allowed text-[#202124] font-semibold rounded-full py-3 text-sm transition-colors"
          >
            Join now
          </button>

          <p className="text-[#9aa0a6] text-xs text-center">
            Meeting code:{' '}
            <span className="text-[#8ab4f8] font-mono">{roomId}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
