'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'

/**
 * Live transcription using the browser's own speech recognition.
 *
 * Each participant transcribes only their OWN microphone and broadcasts the
 * finished lines over the existing socket. That gives correct speaker
 * attribution for free, uses the clean local mic rather than compressed
 * received audio, costs nothing, and needs no server.
 *
 * Privacy: Chrome's implementation streams microphone audio to Google's speech
 * service for recognition. That is why this is off by default, announced to
 * the whole room when switched on, and stops the moment you mute.
 */

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: {
    length: number
    [index: number]: {
      isFinal: boolean
      0: { transcript: string; confidence: number }
    }
  }
}

type RecognitionCtor = new () => SpeechRecognitionLike

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function transcriptionSupported(): boolean {
  return recognitionCtor() !== null
}

interface UseTranscriptionProps {
  socket: Socket
  /** Recognition pauses while muted, so a muted mic is never transcribed. */
  isAudioEnabled: boolean
  onNotice?: (kind: 'info' | 'warning' | 'error', message: string) => void
}

export interface UseTranscriptionReturn {
  supported: boolean
  isTranscribing: boolean
  /** What the local speaker is saying right now, before it is finalised. */
  interim: string
  start: () => void
  stop: () => void
  toggle: () => void
}

export function useTranscription({
  socket,
  isAudioEnabled,
  onNotice,
}: UseTranscriptionProps): UseTranscriptionReturn {
  const [supported] = useState(() => transcriptionSupported())
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [interim, setInterim] = useState('')

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  /** Desired state; the recogniser itself stops constantly and is restarted. */
  const wantRunningRef = useRef(false)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const noticeRef = useRef(onNotice)
  noticeRef.current = onNotice
  const audioEnabledRef = useRef(isAudioEnabled)
  audioEnabledRef.current = isAudioEnabled

  const stopRecogniser = useCallback(() => {
    clearTimeout(restartTimerRef.current)
    const recognition = recognitionRef.current
    if (!recognition) return
    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null
    try {
      recognition.abort()
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null
    setInterim('')
  }, [])

  const startRecogniser = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor || recognitionRef.current) return

    let recognition: SpeechRecognitionLike
    try {
      recognition = new Ctor()
    } catch {
      return
    }

    recognition.lang = navigator.language || 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let pending = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const text = result[0]?.transcript?.trim()
        if (!text) continue

        if (result.isFinal) {
          // Never emit anything captured while muted.
          if (audioEnabledRef.current) {
            socket.emit('transcript', { text })
          }
        } else {
          pending += `${text} `
        }
      }
      setInterim(pending.trim())
    }

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wantRunningRef.current = false
        setIsTranscribing(false)
        noticeRef.current?.('error', 'Microphone access is needed for live notes.')
        return
      }
      // 'no-speech', 'aborted' and 'network' are routine; onend restarts us.
    }

    recognition.onend = () => {
      recognitionRef.current = null
      setInterim('')
      // The engine stops on its own after silence; bring it straight back.
      if (wantRunningRef.current) {
        restartTimerRef.current = setTimeout(() => startRecogniser(), 350)
      }
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
    } catch {
      // start() throws if one is somehow already running; let onend recycle it.
    }
  }, [socket])

  const start = useCallback(() => {
    if (!supported || wantRunningRef.current) return
    wantRunningRef.current = true
    setIsTranscribing(true)
    socket.emit('transcription-state', { isTranscribing: true })
    if (audioEnabledRef.current) startRecogniser()
  }, [supported, socket, startRecogniser])

  const stop = useCallback(() => {
    if (!wantRunningRef.current) return
    wantRunningRef.current = false
    setIsTranscribing(false)
    socket.emit('transcription-state', { isTranscribing: false })
    stopRecogniser()
  }, [socket, stopRecogniser])

  const toggle = useCallback(() => {
    if (wantRunningRef.current) stop()
    else start()
  }, [start, stop])

  // Muting should genuinely stop recognition, not just drop its output.
  useEffect(() => {
    if (!wantRunningRef.current) return
    if (isAudioEnabled) startRecogniser()
    else stopRecogniser()
  }, [isAudioEnabled, startRecogniser, stopRecogniser])

  useEffect(() => {
    return () => {
      wantRunningRef.current = false
      stopRecogniser()
    }
  }, [stopRecogniser])

  return { supported, isTranscribing, interim, start, stop, toggle }
}
