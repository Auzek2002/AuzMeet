'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RecordingEntry, RecordingMode } from '@/types'
import {
  FrameSource,
  MeetingRecorder,
  extensionFor,
  isRecordingSupported,
} from '@/lib/recording'
import { requestDisplayCapture } from '@/lib/displayCapture'

interface UseRecorderProps {
  roomId: string
  /** All currently visible surfaces, cameras and screens alike. */
  buildSources: () => FrameSource[]
  /** Every stream whose audio belongs in the recording. */
  buildAudioStreams: () => { id: string; stream: MediaStream }[]
  /** Called when recording starts/stops so the room can tell other people. */
  onRecordingChange?: (isRecording: boolean) => void
  onError?: (message: string) => void
}

export interface UseRecorderReturn {
  supported: boolean
  isRecording: boolean
  isPaused: boolean
  mode: RecordingMode | null
  elapsedMs: number
  recordings: RecordingEntry[]
  start: (mode: RecordingMode) => Promise<void>
  stop: () => Promise<void>
  pause: () => void
  resume: () => void
  remove: (id: string) => void
}

function timestampName(roomId: string, mode: RecordingMode, mimeType: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(
    now.getHours()
  )}-${pad(now.getMinutes())}`
  return `auzmeet_${roomId}_${mode}_${stamp}.${extensionFor(mimeType)}`
}

export function useRecorder({
  roomId,
  buildSources,
  buildAudioStreams,
  onRecordingChange,
  onError,
}: UseRecorderProps): UseRecorderReturn {
  const [supported] = useState(() => typeof window !== 'undefined' && isRecordingSupported())
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [mode, setMode] = useState<RecordingMode | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [recordings, setRecordings] = useState<RecordingEntry[]>([])

  const recorderRef = useRef<MeetingRecorder | null>(null)
  /** A display capture started purely for recording (nobody was sharing). */
  const adHocScreenRef = useRef<MediaStream | null>(null)

  // Keep the latest builders in refs: the recorder pulls them every frame and
  // must never hold a stale closure over the participant list.
  const sourcesRef = useRef(buildSources)
  const audioRef = useRef(buildAudioStreams)
  sourcesRef.current = buildSources
  audioRef.current = buildAudioStreams

  const releaseAdHocScreen = useCallback(() => {
    adHocScreenRef.current?.getTracks().forEach((track) => track.stop())
    adHocScreenRef.current = null
  }, [])

  const finalize = useCallback(
    async (recorder: MeetingRecorder, recordingMode: RecordingMode) => {
      const { blob, mimeType, durationMs } = await recorder.stop()
      releaseAdHocScreen()

      if (blob.size === 0) {
        onError?.('The recording came back empty and was discarded.')
        return
      }

      const entry: RecordingEntry = {
        id: `rec-${Date.now()}`,
        name: timestampName(roomId, recordingMode, mimeType),
        url: URL.createObjectURL(blob),
        size: blob.size,
        durationMs,
        mimeType,
        createdAt: new Date().toISOString(),
        mode: recordingMode,
      }
      setRecordings((prev) => [entry, ...prev])
    },
    [roomId, onError, releaseAdHocScreen]
  )

  const start = useCallback(
    async (requestedMode: RecordingMode) => {
      if (!supported) {
        onError?.('Recording is not supported in this browser.')
        return
      }
      if (recorderRef.current) return

      // 'screen' records a display at full fidelity. If nobody is presenting,
      // ask for a capture so "record my screen" works on its own.
      if (requestedMode === 'screen') {
        const hasScreen = sourcesRef.current().some((source) => source.isScreen)
        if (!hasScreen) {
          try {
            const captured = await requestDisplayCapture()
            adHocScreenRef.current = captured
            // If the user stops the capture from the browser chrome, end the
            // recording rather than silently recording a dead stream.
            captured.getVideoTracks()[0]?.addEventListener('ended', () => {
              void stopRef.current?.()
            })
          } catch (err) {
            const name = (err as DOMException)?.name
            if (name !== 'NotAllowedError' && name !== 'AbortError') {
              onError?.('Could not capture your screen.')
            }
            return
          }
        }
      }

      const getSources = (): FrameSource[] => {
        const live = sourcesRef.current()

        if (requestedMode === 'camera') {
          const own = live.find((source) => source.id === 'local' && !source.isScreen)
          return own ? [own] : []
        }

        if (requestedMode === 'screen') {
          if (adHocScreenRef.current) {
            return [
              {
                id: 'adhoc-screen',
                stream: adHocScreenRef.current,
                label: 'Screen recording',
                isScreen: true,
                showVideo: true,
                isMuted: false,
                isSpeaking: false,
              },
            ]
          }
          const screen = live.find((source) => source.isScreen)
          return screen ? [screen] : []
        }

        return live
      }

      const getAudioStreams = () => {
        const streams = audioRef.current()
        if (adHocScreenRef.current) {
          streams.push({ id: 'adhoc-screen', stream: adHocScreenRef.current })
        }
        return streams
      }

      // Screen mode records the capture track itself, at whatever resolution
      // the desktop is running, so every tab and app the user moves to is
      // captured exactly as it looked.
      const getDirectVideoTrack = (): MediaStreamTrack | null => {
        if (requestedMode !== 'screen') return null
        if (adHocScreenRef.current) {
          return adHocScreenRef.current.getVideoTracks()[0] ?? null
        }
        const shared = sourcesRef.current().find((source) => source.isScreen)
        return shared?.stream?.getVideoTracks()[0] ?? null
      }

      // A composited meeting that includes a shared screen gets a 1080p frame
      // so the presented content is still readable in the file.
      const hasScreenOnStage = sourcesRef.current().some((source) => source.isScreen)
      const composedSize =
        requestedMode === 'camera'
          ? { width: 960, height: 540 }
          : hasScreenOnStage
          ? { width: 1920, height: 1080 }
          : { width: 1280, height: 720 }

      try {
        const recorder = new MeetingRecorder({
          mode: requestedMode,
          getSources,
          getAudioStreams,
          getDirectVideoTrack,
          title: roomId,
          ...composedSize,
          fps: requestedMode === 'screen' ? 25 : 24,
        })
        recorder.start()
        recorderRef.current = recorder
        setMode(requestedMode)
        setIsRecording(true)
        setIsPaused(false)
        setElapsedMs(0)
        onRecordingChange?.(true)
      } catch (err) {
        console.error('[Recorder] could not start:', err)
        releaseAdHocScreen()
        onError?.(err instanceof Error ? err.message : 'Recording failed to start.')
      }
    },
    [supported, roomId, onError, onRecordingChange, releaseAdHocScreen]
  )

  const stop = useCallback(async () => {
    const recorder = recorderRef.current
    const currentMode = mode
    if (!recorder || !currentMode) return

    recorderRef.current = null
    setIsRecording(false)
    setIsPaused(false)
    setMode(null)
    onRecordingChange?.(false)

    try {
      await finalize(recorder, currentMode)
    } catch (err) {
      console.error('[Recorder] could not finalize:', err)
      onError?.('Something went wrong while saving the recording.')
    }
  }, [mode, finalize, onRecordingChange, onError])

  // stop() is referenced from inside start() (for the capture-ended listener),
  // which is defined first — a ref keeps that reference current.
  const stopRef = useRef<() => Promise<void>>()
  stopRef.current = stop

  const pause = useCallback(() => {
    recorderRef.current?.pause()
    setIsPaused(true)
  }, [])

  const resume = useCallback(() => {
    recorderRef.current?.resume()
    setIsPaused(false)
  }, [])

  const remove = useCallback((id: string) => {
    setRecordings((prev) => {
      const target = prev.find((entry) => entry.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((entry) => entry.id !== id)
    })
  }, [])

  // Elapsed clock, plus picking up participants who joined mid-recording.
  useEffect(() => {
    if (!isRecording) return
    const interval = setInterval(() => {
      const recorder = recorderRef.current
      if (!recorder) return
      setElapsedMs(recorder.elapsedMs())
      recorder.syncAudio()
    }, 500)
    return () => clearInterval(interval)
  }, [isRecording])

  // Closing the tab mid-recording would lose the file, so warn first.
  useEffect(() => {
    if (!isRecording) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isRecording])

  // Release object URLs if the component goes away with recordings in hand.
  useEffect(() => {
    return () => {
      recorderRef.current?.stop().catch(() => {})
      recorderRef.current = null
      adHocScreenRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  return {
    supported,
    isRecording,
    isPaused,
    mode,
    elapsedMs,
    recordings,
    start,
    stop,
    pause,
    resume,
    remove,
  }
}
