'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  Mic,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { MeetingNotes, TranscriptEntry } from '@/types'
import { downloadMarkdown, notesToMarkdown } from '@/lib/notes'

interface NotesPanelProps {
  roomId: string
  entries: TranscriptEntry[]
  interim: string
  supported: boolean
  isTranscribing: boolean
  onToggleTranscription: () => void
  othersTranscribing: string[]
  onClose: () => void
}

type Tab = 'notes' | 'transcript'

export function NotesPanel({
  roomId,
  entries,
  interim,
  supported,
  isTranscribing,
  onToggleTranscription,
  othersTranscribing,
  onClose,
}: NotesPanelProps) {
  const [tab, setTab] = useState<Tab>('notes')
  const [notes, setNotes] = useState<MeetingNotes | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fallbackReason, setFallbackReason] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tab === 'transcript') endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries.length, interim, tab])

  const markdown = useMemo(
    () => (notes ? notesToMarkdown(notes, { roomId, entries, includeTranscript: true }) : ''),
    [notes, roomId, entries]
  )

  const generate = async () => {
    setGenerating(true)
    setError(null)
    setFallbackReason(null)
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Could not generate notes.')
        return
      }
      setNotes(data.notes as MeetingNotes)
      if (data.fallback && data.reason) setFallbackReason(data.reason as string)
      setTab('notes')
    } catch {
      setError('Could not reach the server to generate notes.')
    } finally {
      setGenerating(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to the clipboard.')
    }
  }

  return (
    <div className="w-full sm:w-96 bg-surface h-full flex flex-col sm:border-l border-line panel-enter">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-line flex-shrink-0">
        <h2 className="text-white font-medium flex items-center gap-2">
          <FileText size={16} className="text-accent" />
          Meeting notes
        </h2>
        <button
          onClick={onClose}
          className="text-muted hover:text-white p-1 rounded transition-colors"
          aria-label="Close notes"
        >
          <X size={18} />
        </button>
      </div>

      {/* Capture control */}
      <div className="px-3 py-3 border-b border-line flex-shrink-0">
        {!supported ? (
          <div className="flex items-start gap-2 bg-amber-400/10 border border-amber-400/25 rounded-lg px-3 py-2.5">
            <TriangleAlert size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-amber-200 text-xs leading-relaxed">
              This browser cannot transcribe speech. Live notes work in Chrome and Edge. You can
              still read anything other participants have captured.
            </p>
          </div>
        ) : (
          <>
            <button
              onClick={onToggleTranscription}
              aria-pressed={isTranscribing}
              className={clsx(
                'w-full flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold transition-colors',
                isTranscribing
                  ? 'bg-danger hover:bg-danger-hover text-white'
                  : 'bg-accent-strong hover:bg-accent-strong-hover text-white'
              )}
            >
              <Mic size={14} />
              {isTranscribing ? 'Stop taking notes' : 'Start taking notes'}
            </button>
            <p className="text-subtle text-[11px] leading-relaxed mt-2">
              {isTranscribing
                ? 'Listening to your microphone. It pauses while you are muted, and everyone in the meeting has been told notes are on.'
                : 'Transcribes only your own microphone, and tells the room when it starts. Speech is sent to your browser’s speech service for recognition.'}
            </p>
          </>
        )}

        {othersTranscribing.length > 0 && (
          <p className="text-muted text-[11px] mt-2">
            Also taking notes: {othersTranscribing.join(', ')}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line flex-shrink-0">
        {(
          [
            ['notes', 'Notes'],
            ['transcript', `Transcript${entries.length ? ` (${entries.length})` : ''}`],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={clsx(
              'flex-1 text-xs font-medium py-2.5 transition-colors',
              tab === value
                ? 'text-accent border-b-2 border-accent'
                : 'text-muted hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'transcript' ? (
          <div className="px-3 py-3 space-y-2.5">
            {entries.length === 0 && !interim ? (
              <p className="text-muted text-sm text-center mt-6 leading-relaxed">
                Nothing captured yet.
                <br />
                Start taking notes and speak.
              </p>
            ) : (
              entries.map((entry) => (
                <div key={entry.id}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-accent text-xs font-medium">{entry.speakerName}</span>
                    <span className="text-subtle text-[10px]">
                      {new Date(entry.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-primary text-sm leading-relaxed">{entry.text}</p>
                </div>
              ))
            )}
            {interim && <p className="text-muted text-sm italic leading-relaxed">{interim}…</p>}
            <div ref={endRef} />
          </div>
        ) : (
          <div className="px-3 py-3">
            {error && (
              <div className="flex items-start gap-2 bg-danger/10 border border-danger/30 rounded-lg px-3 py-2.5 mb-3">
                <TriangleAlert size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-200 text-xs leading-relaxed">{error}</p>
              </div>
            )}

            {!notes ? (
              <div className="text-center mt-4">
                <p className="text-muted text-sm leading-relaxed mb-4 px-2">
                  {entries.length === 0
                    ? 'Capture some speech first, then generate notes from it.'
                    : `${entries.length} segments captured. Generate a summary, decisions and action items.`}
                </p>
                <button
                  onClick={generate}
                  disabled={generating || entries.length === 0}
                  className="inline-flex items-center gap-2 bg-accent-strong hover:bg-accent-strong-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-full px-5 py-2.5 transition-colors"
                >
                  {generating ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {generating ? 'Writing notes…' : 'Generate notes'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {fallbackReason && (
                  <p className="text-amber-200/90 text-[11px] bg-amber-400/10 border border-amber-400/25 rounded-lg px-3 py-2 leading-relaxed">
                    {fallbackReason}
                  </p>
                )}

                <section>
                  <h3 className="text-muted text-[11px] font-semibold uppercase tracking-wide mb-1.5">
                    Summary
                  </h3>
                  <p className="text-primary text-sm leading-relaxed">{notes.summary}</p>
                </section>

                {notes.keyPoints.length > 0 && (
                  <section>
                    <h3 className="text-muted text-[11px] font-semibold uppercase tracking-wide mb-1.5">
                      Key points
                    </h3>
                    <ul className="space-y-1.5">
                      {notes.keyPoints.map((point, i) => (
                        <li key={i} className="text-primary text-sm leading-relaxed flex gap-2">
                          <span className="text-accent flex-shrink-0">•</span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {notes.decisions.length > 0 && (
                  <section>
                    <h3 className="text-muted text-[11px] font-semibold uppercase tracking-wide mb-1.5">
                      Decisions
                    </h3>
                    <ul className="space-y-1.5">
                      {notes.decisions.map((decision, i) => (
                        <li key={i} className="text-primary text-sm leading-relaxed flex gap-2">
                          <span className="text-emerald-400 flex-shrink-0">✓</span>
                          {decision}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {notes.actionItems.length > 0 && (
                  <section>
                    <h3 className="text-muted text-[11px] font-semibold uppercase tracking-wide mb-1.5">
                      Action items
                    </h3>
                    <ul className="space-y-1.5">
                      {notes.actionItems.map((item, i) => (
                        <li key={i} className="text-primary text-sm leading-relaxed flex gap-2">
                          <span className="text-amber-400 flex-shrink-0">☐</span>
                          <span>
                            {item.owner && (
                              <span className="text-accent font-medium">{item.owner} — </span>
                            )}
                            {item.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() =>
                      downloadMarkdown(markdown, `auzmeet_notes_${roomId}.md`)
                    }
                    className="flex-1 flex items-center justify-center gap-1.5 bg-accent-strong hover:bg-accent-strong-hover text-white text-xs font-semibold rounded-full py-2 transition-colors"
                  >
                    <Download size={13} />
                    Download
                  </button>
                  <button
                    onClick={copy}
                    className="flex items-center justify-center gap-1.5 bg-elevated hover:bg-elevated-hover text-primary text-xs font-medium rounded-full px-3 py-2 transition-colors"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <button
                  onClick={generate}
                  disabled={generating}
                  className="w-full text-muted hover:text-white text-[11px] transition-colors disabled:opacity-50"
                >
                  {generating ? 'Regenerating…' : 'Regenerate from the latest transcript'}
                </button>

                <p className="text-subtle text-[10px] text-center leading-relaxed">
                  Written by {notes.generatedBy === 'local' ? 'AuzMeet (no AI model)' : notes.generatedBy}.
                  Worth a read-through before you send them on.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
