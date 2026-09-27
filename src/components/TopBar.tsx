'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Grid3x3, LayoutGrid, Lock, MonitorUp, Square, Users, Video } from 'lucide-react'
import { clsx } from 'clsx'
import { LayoutMode } from '@/types'
import { formatDuration } from '@/lib/recording'
import { CaptureSurface, surfaceLabel } from '@/lib/displayCapture'

interface TopBarProps {
  roomId: string
  participantCount: number
  maxParticipants: number
  layout: LayoutMode
  onLayoutChange: (layout: LayoutMode) => void
  isLocked: boolean
  /** Set while this user is presenting, naming what they picked. */
  sharingSurface: CaptureSurface | null
  /** Names of everyone recording, local user included. */
  recordingBy: string[]
  isRecordingLocally: boolean
  recordingElapsedMs: number
  onStopRecording: () => void
}

const LAYOUTS: { mode: LayoutMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'auto', label: 'Automatic', icon: <LayoutGrid size={14} /> },
  { mode: 'grid', label: 'Grid — everyone the same size', icon: <Grid3x3 size={14} /> },
  { mode: 'spotlight', label: 'Spotlight — active speaker', icon: <Square size={14} /> },
]

export function TopBar({
  roomId,
  participantCount,
  maxParticipants,
  layout,
  onLayoutChange,
  isLocked,
  sharingSurface,
  recordingBy,
  isRecordingLocally,
  recordingElapsedMs,
  onStopRecording,
}: TopBarProps) {
  const [elapsed, setElapsed] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const copyLink = async () => {
    const link = `${window.location.origin}/meeting/${roomId}`
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      const field = document.createElement('textarea')
      field.value = link
      document.body.appendChild(field)
      field.select()
      document.execCommand('copy')
      field.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isFull = participantCount >= maxParticipants

  return (
    <div className="flex-shrink-0 h-11 sm:h-12 bg-app border-b border-line flex items-center gap-2 px-2 sm:px-4">
      {/* Brand + meeting code */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-6 h-6 bg-accent-strong rounded-md flex items-center justify-center flex-shrink-0">
          <Video size={13} className="text-white" />
        </span>
        <span className="text-white text-sm font-medium hidden md:inline">AuzMeet</span>
        <span className="hidden sm:inline text-subtle">|</span>
        <button
          onClick={copyLink}
          title="Copy the meeting link"
          className="group flex items-center gap-1.5 text-muted hover:text-white text-xs font-mono truncate transition-colors touch-manipulation"
        >
          <span className="truncate">{roomId}</span>
          {copied ? (
            <Check size={12} className="text-emerald-400 flex-shrink-0" />
          ) : (
            <Copy size={12} className="flex-shrink-0 opacity-60 group-hover:opacity-100" />
          )}
        </button>
      </div>

      <div className="flex-1" />

      {/* Recording banner — visible to everyone in the room */}
      {recordingBy.length > 0 && (
        <div className="flex items-center gap-2 bg-red-600/15 border border-red-500/30 rounded-full pl-2.5 pr-1.5 py-1">
          <span className="flex items-center gap-1.5 text-red-300 text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 rec-pulse" />
            <span className="hidden sm:inline">
              {isRecordingLocally
                ? `Recording ${formatDuration(recordingElapsedMs)}`
                : `${recordingBy[0]}${recordingBy.length > 1 ? ` +${recordingBy.length - 1}` : ''} recording`}
            </span>
            <span className="sm:hidden">REC</span>
          </span>
          {isRecordingLocally && (
            <button
              onClick={onStopRecording}
              title="Stop recording"
              className="bg-red-600 hover:bg-red-700 text-white rounded-full p-1 touch-manipulation"
            >
              <Square size={9} fill="currentColor" />
            </button>
          )}
        </div>
      )}

      {/* What this user is presenting, so a tab-only share is never mistaken
          for the whole desktop. */}
      {sharingSurface && (
        <span
          title={`You are presenting: ${surfaceLabel(sharingSurface)}`}
          className="flex items-center gap-1.5 text-[11px] font-medium bg-accent/15 border border-accent/30 text-accent rounded-full px-2 py-1"
        >
          <MonitorUp size={10} />
          <span className="hidden sm:inline">{surfaceLabel(sharingSurface)}</span>
        </span>
      )}

      {isLocked && (
        <span
          title="The meeting is locked — nobody new can join"
          className="hidden sm:flex items-center gap-1 text-amber-400 text-[11px] font-medium bg-amber-400/10 border border-amber-400/25 rounded-full px-2 py-1"
        >
          <Lock size={10} />
          Locked
        </span>
      )}

      {/* Layout switcher */}
      <div className="hidden sm:flex items-center bg-elevated rounded-lg p-0.5">
        {LAYOUTS.map((option) => (
          <button
            key={option.mode}
            onClick={() => onLayoutChange(option.mode)}
            title={option.label}
            className={clsx(
              'p-1.5 rounded-md transition-colors',
              layout === option.mode
                ? 'bg-accent text-app'
                : 'text-muted hover:text-white'
            )}
          >
            {option.icon}
          </button>
        ))}
      </div>

      {/* Participant count */}
      <span
        title={`${participantCount} of ${maxParticipants} participants`}
        className={clsx(
          'flex items-center gap-1.5 text-xs font-medium rounded-full px-2 py-1',
          isFull ? 'bg-amber-400/15 text-amber-300' : 'bg-elevated text-primary'
        )}
      >
        <Users size={12} />
        {participantCount}
        <span className="text-muted hidden sm:inline">/ {maxParticipants}</span>
      </span>

      <span className="text-muted text-xs font-mono tabular-nums hidden md:inline">
        {formatDuration(elapsed * 1000)}
      </span>
    </div>
  )
}
