'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Mic, MicOff, TriangleAlert, Video, VideoOff } from 'lucide-react'
import { clsx } from 'clsx'
import { useMediaDevices } from '@/hooks/useMediaDevices'
import { CAMERA_CONSTRAINTS } from '@/hooks/useWebRTC'

interface PreJoinScreenProps {
  roomId: string
  onJoin: (name: string, stream: MediaStream | null) => void
}

const NAME_STORAGE_KEY = 'auzmeet:name'

export function PreJoinScreen({ roomId, onJoin }: PreJoinScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [hasStream, setHasStream] = useState(false)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [name, setName] = useState('')
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [cameraId, setCameraId] = useState('')
  const [micId, setMicId] = useState('')
  const [micLevel, setMicLevel] = useState(0)
  const [noRelay, setNoRelay] = useState(false)

  const devices = useMediaDevices(hasStream)

  // Check for a relay up front: it is the difference between a call that works
  // for everyone and one that only works on your own network.
  useEffect(() => {
    let active = true
    fetch('/api/turn-credentials')
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.hasTurn === false) setNoRelay(true)
      })
      .catch(() => {
        /* the meeting will surface connection problems on its own */
      })
    return () => {
      active = false
    }
  }, [])

  // Remember the name between meetings.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(NAME_STORAGE_KEY)
      if (stored) setName(stored)
    } catch {
      // Private browsing can refuse storage; the field just starts empty.
    }
  }, [])

  const attach = useCallback((stream: MediaStream) => {
    streamRef.current = stream
    setHasStream(true)
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {})
    }
    setCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? '')
    setMicId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? '')
  }, [])

  // Acquire camera + mic once on mount.
  useEffect(() => {
    let active = true

    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: CAMERA_CONSTRAINTS,
          audio: true,
        })
        if (!active) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        attach(stream)
      } catch (err) {
        console.warn('[PreJoin] getUserMedia failed:', err)
        // Fall back to audio only - a mic-only participant is still useful.
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true })
          if (!active) {
            audioOnly.getTracks().forEach((track) => track.stop())
            return
          }
          attach(audioOnly)
          setIsVideoEnabled(false)
          setMediaError('No camera found. You will join with audio only.')
        } catch {
          if (active) {
            setMediaError('Camera and microphone are unavailable. You can still join to watch and chat.')
          }
        }
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void getMedia()
    return () => {
      active = false
      // Tracks are handed to the meeting, so they are deliberately not stopped.
    }
  }, [attach])

  // Live mic meter, so people can check they are actually being heard.
  useEffect(() => {
    const stream = streamRef.current
    if (!hasStream || !stream || stream.getAudioTracks().length === 0) return

    let context: AudioContext
    try {
      context = new AudioContext()
    } catch {
      return
    }
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const buffer = new Uint8Array(analyser.fftSize)

    const interval = setInterval(() => {
      analyser.getByteTimeDomainData(buffer)
      let sum = 0
      for (let i = 0; i < buffer.length; i += 1) {
        const deviation = (buffer[i] - 128) / 128
        sum += deviation * deviation
      }
      const rms = Math.sqrt(sum / buffer.length)
      setMicLevel(isAudioEnabled ? Math.min(1, rms * 6) : 0)
    }, 100)

    return () => {
      clearInterval(interval)
      source.disconnect()
      analyser.disconnect()
      void context.close().catch(() => {})
    }
  }, [hasStream, isAudioEnabled])

  const toggleAudio = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setIsAudioEnabled(track.enabled)
  }, [])

  const toggleVideo = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setIsVideoEnabled(track.enabled)
  }, [])

  /** Swaps one input device in the preview stream before joining. */
  const changeDevice = useCallback(
    async (kind: 'video' | 'audio', deviceId: string) => {
      const stream = streamRef.current
      if (!stream) return
      try {
        const replacement = await navigator.mediaDevices.getUserMedia(
          kind === 'video'
            ? { video: { deviceId: { exact: deviceId }, ...CAMERA_CONSTRAINTS } }
            : { audio: { deviceId: { exact: deviceId } } }
        )
        const newTrack = kind === 'video' ? replacement.getVideoTracks()[0] : replacement.getAudioTracks()[0]
        if (!newTrack) return

        const oldTrack = kind === 'video' ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0]
        if (oldTrack) {
          newTrack.enabled = oldTrack.enabled
          oldTrack.stop()
          stream.removeTrack(oldTrack)
        }
        stream.addTrack(newTrack)

        if (kind === 'video') {
          setCameraId(deviceId)
          if (videoRef.current) videoRef.current.srcObject = stream
        } else {
          setMicId(deviceId)
        }
      } catch (err) {
        console.warn('[PreJoin] could not switch device:', err)
      }
    },
    []
  )

  const handleJoin = useCallback(() => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      localStorage.setItem(NAME_STORAGE_KEY, trimmed)
    } catch {
      // Not being able to remember the name is harmless.
    }
    onJoin(trimmed, streamRef.current)
  }, [name, onJoin])

  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'

  const showPreview = hasStream && isVideoEnabled

  return (
    <div className="min-h-screen bg-app flex flex-col items-center justify-center px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <div className="w-7 h-7 bg-accent-strong rounded-md flex items-center justify-center">
          <Video size={16} className="text-white" />
        </div>
        <span className="text-white text-lg font-medium">AuzMeet</span>
      </div>

      <div className="max-w-4xl w-full flex flex-col md:flex-row gap-8 items-center">
        {/* Preview */}
        <div className="flex-1 max-w-lg w-full">
          <div className="relative bg-elevated rounded-2xl overflow-hidden aspect-video shadow-2xl">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={clsx(
                'w-full h-full object-cover scale-x-[-1]',
                !showPreview && 'invisible'
              )}
            />

            {!showPreview && !isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 h-24 rounded-full bg-avatar flex items-center justify-center text-white text-3xl font-medium select-none">
                  {initials}
                </div>
              </div>
            )}

            {/* Mic level meter */}
            {hasStream && (
              <div className="absolute top-3 left-3 flex items-end gap-[3px] h-5 bg-black/40 rounded-lg px-2 py-1">
                {[0, 1, 2, 3, 4].map((index) => (
                  <span
                    key={index}
                    className={clsx(
                      'w-[3px] rounded-sm transition-all duration-75',
                      micLevel * 5 > index ? 'bg-accent' : 'bg-white/25'
                    )}
                    style={{ height: `${30 + index * 15}%` }}
                  />
                ))}
              </div>
            )}

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
              <button
                onClick={toggleAudio}
                disabled={!hasStream}
                title={isAudioEnabled ? 'Mute' : 'Unmute'}
                className={clsx(
                  'p-3 rounded-full transition-colors disabled:opacity-40',
                  isAudioEnabled
                    ? 'bg-elevated/80 text-white hover:bg-avatar/80'
                    : 'bg-red-600 text-white hover:bg-red-700'
                )}
              >
                {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <button
                onClick={toggleVideo}
                disabled={!hasStream || streamRef.current?.getVideoTracks().length === 0}
                title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
                className={clsx(
                  'p-3 rounded-full transition-colors disabled:opacity-40',
                  isVideoEnabled
                    ? 'bg-elevated/80 text-white hover:bg-avatar/80'
                    : 'bg-red-600 text-white hover:bg-red-700'
                )}
              >
                {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
            </div>
          </div>

          {mediaError && (
            <p className="flex items-start gap-2 text-amber-300 text-sm mt-3 px-2">
              <TriangleAlert size={14} className="flex-shrink-0 mt-0.5" />
              {mediaError}
            </p>
          )}

          {/* Device pickers */}
          {hasStream && (devices.cameras.length > 1 || devices.microphones.length > 1) && (
            <div className="grid sm:grid-cols-2 gap-2 mt-3">
              {devices.microphones.length > 1 && (
                <label className="block">
                  <span className="flex items-center gap-1.5 text-muted text-xs mb-1">
                    <Mic size={12} /> Microphone
                  </span>
                  <select
                    value={micId}
                    onChange={(event) => void changeDevice('audio', event.target.value)}
                    className="w-full bg-elevated text-primary text-xs rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-accent"
                  >
                    {devices.microphones.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {devices.cameras.length > 1 && (
                <label className="block">
                  <span className="flex items-center gap-1.5 text-muted text-xs mb-1">
                    <Camera size={12} /> Camera
                  </span>
                  <select
                    value={cameraId}
                    onChange={(event) => void changeDevice('video', event.target.value)}
                    className="w-full bg-elevated text-primary text-xs rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-accent"
                  >
                    {devices.cameras.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Join */}
        <div className="flex flex-col items-center gap-5 max-w-xs w-full">
          <div className="text-center">
            <h1 className="text-white text-2xl font-medium mb-1">Ready to join?</h1>
            <p className="text-muted text-sm">
              {isLoading ? 'Checking camera & microphone…' : 'Check your audio and video first.'}
            </p>
          </div>

          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleJoin()}
            placeholder="Your name"
            maxLength={50}
            autoFocus
            className="w-full bg-transparent border border-line-strong focus:border-accent rounded-lg px-4 py-3 text-white placeholder-muted outline-none transition-colors"
          />

          {/* Joining is held back until camera/mic acquisition settles -
              clicking through early would enter the call with no media at all. */}
          <button
            onClick={handleJoin}
            disabled={!name.trim() || isLoading}
            className="w-full bg-accent hover:bg-accent-hover disabled:bg-avatar disabled:cursor-not-allowed text-app font-semibold rounded-full py-3 text-sm transition-colors"
          >
            {isLoading ? 'Preparing your camera…' : 'Join now'}
          </button>

          <p className="text-muted text-xs text-center">
            Meeting code: <span className="text-accent font-mono">{roomId}</span>
          </p>

          {noRelay && (
            <p className="flex items-start gap-1.5 text-amber-300 text-[11px] leading-relaxed text-left">
              <TriangleAlert size={12} className="flex-shrink-0 mt-0.5" />
              <span>
                No TURN relay is configured on this server, so people on other networks may not
                be able to connect.{' '}
                <a href="/diagnostics" target="_blank" rel="noopener noreferrer" className="underline">
                  Test the connection
                </a>
                .
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
