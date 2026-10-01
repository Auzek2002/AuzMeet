'use client'

import { useEffect, useRef, useState } from 'react'

export interface AudioSource {
  id: string
  stream: MediaStream | null
}

interface UseAudioLevelsReturn {
  /** Smoothed loudness per source, roughly 0–1. */
  levels: Record<string, number>
  /** Loudest source above the speaking threshold, held briefly to avoid flicker. */
  activeSpeakerId: string | null
  speakingIds: Record<string, boolean>
}

const SPEAKING_THRESHOLD = 0.045
/** How long a speaker stays "active" after they go quiet, in ms. */
const HOLD_MS = 1600
const SAMPLE_INTERVAL_MS = 120

/** Explicit ArrayBuffer backing keeps getByteTimeDomainData happy in strict TS. */
type SampleBuffer = Uint8Array<ArrayBuffer>

/**
 * Taps each participant's audio with a WebAudio analyser to drive the speaking
 * ring and the spotlight layout. Analysers are never connected to the output,
 * so nothing here affects what people actually hear.
 */
export function useAudioLevels(sources: AudioSource[]): UseAudioLevelsReturn {
  const [levels, setLevels] = useState<Record<string, number>>({})
  const [speakingIds, setSpeakingIds] = useState<Record<string, boolean>>({})
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null)

  const ctxRef = useRef<AudioContext | null>(null)
  const nodesRef = useRef<
    Map<string, { source: MediaStreamAudioSourceNode; analyser: AnalyserNode; buffer: SampleBuffer }>
  >(new Map())
  const smoothedRef = useRef<Map<string, number>>(new Map())
  const lastSpokeRef = useRef<Map<string, number>>(new Map())

  // A stable key so the effect only re-runs when the actual set changes.
  const signature = sources
    .map((entry) => `${entry.id}:${entry.stream?.id ?? 'none'}`)
    .sort()
    .join('|')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sources.length === 0) return

    if (!ctxRef.current) {
      try {
        ctxRef.current = new AudioContext()
      } catch {
        return
      }
    }
    const ctx = ctxRef.current
    if (ctx.state === 'suspended') void ctx.resume()

    const nodes = nodesRef.current
    const wantedIds = new Set<string>()

    for (const { id, stream } of sources) {
      if (!stream || stream.getAudioTracks().length === 0) continue
      wantedIds.add(id)
      if (nodes.has(id)) continue
      try {
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.6
        source.connect(analyser)
        nodes.set(id, {
          source,
          analyser,
          buffer: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
        })
      } catch {
        // A stream can be torn down between render and this call.
      }
    }

    nodes.forEach((node, id) => {
      if (!wantedIds.has(id)) {
        node.source.disconnect()
        node.analyser.disconnect()
        nodes.delete(id)
        smoothedRef.current.delete(id)
        lastSpokeRef.current.delete(id)
      }
    })

    const interval = setInterval(() => {
      const nextLevels: Record<string, number> = {}
      const nextSpeaking: Record<string, boolean> = {}
      const now = Date.now()
      let loudestId: string | null = null
      let loudestLevel = 0

      nodes.forEach(({ analyser, buffer }, id) => {
        analyser.getByteTimeDomainData(buffer)

        let sumSquares = 0
        for (let i = 0; i < buffer.length; i += 1) {
          const deviation = (buffer[i] - 128) / 128
          sumSquares += deviation * deviation
        }
        const rms = Math.sqrt(sumSquares / buffer.length)

        // Exponential smoothing keeps the meter from twitching on every sample.
        const previous = smoothedRef.current.get(id) ?? 0
        const smoothed = previous * 0.6 + rms * 0.4
        smoothedRef.current.set(id, smoothed)
        nextLevels[id] = Math.min(1, smoothed * 6)

        if (smoothed > SPEAKING_THRESHOLD) lastSpokeRef.current.set(id, now)
        const lastSpoke = lastSpokeRef.current.get(id) ?? 0
        nextSpeaking[id] = now - lastSpoke < HOLD_MS

        if (smoothed > loudestLevel && smoothed > SPEAKING_THRESHOLD) {
          loudestLevel = smoothed
          loudestId = id
        }
      })

      setLevels(nextLevels)
      setSpeakingIds(nextSpeaking)
      setActiveSpeakerId((current) => {
        if (loudestId) return loudestId
        // Nobody is talking - keep the last speaker on stage while still recent.
        if (current) {
          const lastSpoke = lastSpokeRef.current.get(current) ?? 0
          if (now - lastSpoke < HOLD_MS * 3) return current
        }
        return current && nodes.has(current) ? current : null
      })
    }, SAMPLE_INTERVAL_MS)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  // Tear the context down only when the hook itself unmounts.
  useEffect(() => {
    return () => {
      nodesRef.current.forEach((node) => {
        node.source.disconnect()
        node.analyser.disconnect()
      })
      nodesRef.current.clear()
      ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
    }
  }, [])

  return { levels, activeSpeakerId, speakingIds }
}
