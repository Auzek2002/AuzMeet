'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AtSign, HelpCircle, Loader2, Radio, Sparkles, TriangleAlert, X } from 'lucide-react'
import { CatchUpBrief, TranscriptEntry } from '@/types'

interface CatchUpCardProps {
  /** Lines spoken before this user joined. Empty means nothing was missed. */
  missed: TranscriptEntry[]
  meetingStartedAt: string | null
  viewerName: string
  /** Rendered as a panel section rather than a floating prompt. */
  inline?: boolean
  onDismiss?: () => void
}

function minutesSince(iso: string | null): number | null {
  if (!iso) return null
  const started = new Date(iso).getTime()
  if (Number.isNaN(started)) return null
  return Math.max(0, Math.round((Date.now() - started) / 60000))
}

/**
 * Offers a late joiner a short brief on what they walked in on.
 *
 * Appears on its own when there is genuinely something missed, because the
 * moment it is useful is the moment you arrive — not somewhere behind a menu.
 */
export function CatchUpCard({
  missed,
  meetingStartedAt,
  viewerName,
  inline = false,
  onDismiss,
}: CatchUpCardProps) {
  const [brief, setBrief] = useState<CatchUpBrief | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestedRef = useRef(false)

  const elapsed = minutesSince(meetingStartedAt)

  const run = useCallback(async () => {
    if (requestedRef.current) return
    requestedRef.current = true
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/catch-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: missed, viewerName }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Could not build the brief.')
        requestedRef.current = false
        return
      }
      setBrief(data.brief as CatchUpBrief)
    } catch {
      setError('Could not reach the server.')
      requestedRef.current = false
    } finally {
      setLoading(false)
    }
  }, [missed, viewerName])

  // In the panel the brief is the whole point, so fetch it without a click.
  useEffect(() => {
    if (inline && missed.length > 0 && !brief && !loading) void run()
  }, [inline, missed.length, brief, loading, run])

  if (missed.length === 0) {
    return inline ? (
      <p className="text-muted text-sm text-center px-6 py-8 leading-relaxed">
        You were here from the start, so there is nothing to catch up on.
      </p>
    ) : null
  }

  const body = (
    <>
      {error && (
        <div className="flex items-start gap-2 bg-danger/10 border border-danger/30 rounded-lg px-3 py-2.5">
          <TriangleAlert size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-200 text-xs leading-relaxed">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-muted text-sm py-2">
          <Loader2 size={14} className="animate-spin text-accent" />
          Reading {missed.length} segments…
        </div>
      )}

      {brief && (
        <div className="space-y-3">
          {brief.headline && (
            <p className="text-primary text-sm font-medium leading-relaxed">{brief.headline}</p>
          )}

          {brief.mentionsOfYou.length > 0 && (
            <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-2">
              <p className="flex items-center gap-1.5 text-accent text-[11px] font-semibold uppercase tracking-wide mb-1">
                <AtSign size={11} />
                Mentioned you
              </p>
              <ul className="space-y-1">
                {brief.mentionsOfYou.map((mention, i) => (
                  <li key={i} className="text-primary text-xs leading-relaxed">
                    {mention}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {brief.missed.length > 0 && (
            <div>
              <p className="text-muted text-[11px] font-semibold uppercase tracking-wide mb-1.5">
                What you missed
              </p>
              <ul className="space-y-1.5">
                {brief.missed.map((item, i) => (
                  <li key={i} className="text-primary text-sm leading-relaxed flex gap-2">
                    <span className="text-accent flex-shrink-0">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {brief.currentTopic && (
            <div className="bg-elevated rounded-lg px-3 py-2">
              <p className="flex items-center gap-1.5 text-muted text-[11px] font-semibold uppercase tracking-wide mb-1">
                <Radio size={11} className="text-emerald-400" />
                Right now
              </p>
              <p className="text-primary text-sm leading-relaxed">{brief.currentTopic}</p>
            </div>
          )}

          {brief.openQuestions.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-muted text-[11px] font-semibold uppercase tracking-wide mb-1.5">
                <HelpCircle size={11} />
                Still open
              </p>
              <ul className="space-y-1.5">
                {brief.openQuestions.map((question, i) => (
                  <li key={i} className="text-primary text-sm leading-relaxed flex gap-2">
                    <span className="text-amber-400 flex-shrink-0">?</span>
                    {question}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-subtle text-[10px] leading-relaxed">
            Summarised from {brief.coveredEntries} segments by {brief.generatedBy}. Speech
            recognition makes mistakes — worth confirming anything important.
          </p>
        </div>
      )}
    </>
  )

  if (inline) {
    return <div className="px-3 py-3 space-y-3">{body}</div>
  }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[min(94vw,26rem)] bg-surface/95 backdrop-blur border border-accent/30 rounded-xl shadow-2xl px-4 py-3">
      <button
        onClick={onDismiss}
        aria-label="Dismiss catch-up"
        className="absolute top-2 right-2 text-muted hover:text-white hover:bg-elevated rounded-md p-1 transition-colors"
      >
        <X size={14} />
      </button>

      <p className="flex items-center gap-2 text-white text-sm font-medium pr-6">
        <Sparkles size={14} className="text-accent flex-shrink-0" />
        {elapsed !== null && elapsed > 0
          ? `This meeting started ${elapsed} minute${elapsed === 1 ? '' : 's'} ago`
          : 'This meeting was already in progress'}
      </p>

      {!brief && !loading && !error && (
        <>
          <p className="text-muted text-xs mt-1 mb-2.5 leading-relaxed">
            {missed.length} segments were spoken before you joined.
          </p>
          <button
            onClick={() => void run()}
            className="w-full flex items-center justify-center gap-1.5 bg-accent-strong hover:bg-accent-strong-hover text-white text-xs font-semibold rounded-full py-2 transition-colors"
          >
            <Sparkles size={13} />
            Catch me up
          </button>
        </>
      )}

      <div className="mt-2 max-h-[55vh] overflow-y-auto">{body}</div>
    </div>
  )
}
