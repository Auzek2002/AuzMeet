'use client'

import { Circle, Disc, Download, Square, Trash2, TriangleAlert, X } from 'lucide-react'
import { clsx } from 'clsx'
import { RecordingEntry, RecordingMode } from '@/types'
import { downloadBlob, formatBytes, formatDuration } from '@/lib/recording'

interface RecordingsPanelProps {
  recordings: RecordingEntry[]
  supported: boolean
  isRecording: boolean
  isPaused: boolean
  elapsedMs: number
  activeMode: RecordingMode | null
  someoneIsSharing: boolean
  onStart: (mode: RecordingMode) => void
  onStop: () => void
  onPause: () => void
  onResume: () => void
  onRemove: (id: string) => void
  onClose: () => void
}

const MODE_LABEL: Record<RecordingMode, string> = {
  meeting: 'Whole meeting',
  screen: 'Screen',
  camera: 'Just me',
}

export function RecordingsPanel({
  recordings,
  supported,
  isRecording,
  isPaused,
  elapsedMs,
  activeMode,
  someoneIsSharing,
  onStart,
  onStop,
  onPause,
  onResume,
  onRemove,
  onClose,
}: RecordingsPanelProps) {
  return (
    <div className="w-full sm:w-80 bg-surface h-full flex flex-col sm:border-l border-line panel-enter">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-line flex-shrink-0">
        <h2 className="text-white font-medium">
          Recordings{' '}
          {recordings.length > 0 && (
            <span className="text-muted font-normal">({recordings.length})</span>
          )}
        </h2>
        <button
          onClick={onClose}
          className="text-muted hover:text-white p-1 rounded transition-colors"
          aria-label="Close recordings"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!supported && (
          <div className="m-3 flex items-start gap-2 bg-amber-400/10 border border-amber-400/25 rounded-lg px-3 py-2.5">
            <TriangleAlert size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-amber-200 text-xs leading-relaxed">
              This browser cannot record video. Recording works in recent versions of Chrome, Edge
              and Firefox.
            </p>
          </div>
        )}

        {/* Live recording state */}
        {supported && (
          <div className="p-3 border-b border-line">
            {isRecording ? (
              <div className="bg-elevated rounded-xl p-3">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={clsx(
                      'w-2 h-2 rounded-full bg-red-500',
                      !isPaused && 'rec-pulse'
                    )}
                  />
                  <span className="text-white text-sm font-medium">
                    {isPaused ? 'Paused' : 'Recording'}
                  </span>
                  <span className="ml-auto text-primary text-sm font-mono tabular-nums">
                    {formatDuration(elapsedMs)}
                  </span>
                </div>
                <p className="text-muted text-xs mb-3">
                  {activeMode ? MODE_LABEL[activeMode] : ''} — saved on this device
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={onStop}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-full py-2 transition-colors"
                  >
                    <Square size={11} fill="currentColor" />
                    Stop &amp; save
                  </button>
                  <button
                    onClick={isPaused ? onResume : onPause}
                    className="flex items-center justify-center gap-1.5 bg-avatar hover:bg-elevated-hover text-white text-xs font-medium rounded-full px-3 py-2 transition-colors"
                  >
                    {isPaused ? <Circle size={11} /> : <Disc size={11} />}
                    {isPaused ? 'Resume' : 'Pause'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-muted text-[11px] font-semibold uppercase tracking-wide px-1 pb-0.5">
                  Start a recording
                </p>
                {(
                  [
                    ['meeting', 'Whole meeting'],
                    ['screen', someoneIsSharing ? 'Shared screen' : 'My screen'],
                    ['camera', 'Just me'],
                  ] as [RecordingMode, string][]
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => onStart(mode)}
                    className="w-full flex items-center gap-2 bg-elevated hover:bg-avatar text-primary text-sm rounded-lg px-3 py-2 transition-colors"
                  >
                    <Circle size={12} className="text-red-400 flex-shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Finished recordings */}
        {recordings.length === 0 ? (
          <p className="text-muted text-sm text-center px-6 mt-6 leading-relaxed">
            Nothing recorded yet.
            <br />
            Recordings appear here, ready to download.
          </p>
        ) : (
          <div className="p-3 space-y-2">
            {recordings.map((entry) => (
              <div key={entry.id} className="bg-elevated rounded-xl p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {MODE_LABEL[entry.mode]}
                    </p>
                    <p className="text-muted text-xs">
                      {formatDuration(entry.durationMs)} · {formatBytes(entry.size)} ·{' '}
                      {new Date(entry.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => onRemove(entry.id)}
                    title="Discard this recording"
                    className="text-muted hover:text-red-400 p-1 flex-shrink-0 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <video
                  src={entry.url}
                  controls
                  preload="metadata"
                  className="w-full rounded-lg bg-black aspect-video mb-2"
                />

                <button
                  onClick={() => downloadBlob(entry.url, entry.name)}
                  className="w-full flex items-center justify-center gap-1.5 bg-accent-strong hover:bg-accent-strong-hover text-white text-xs font-semibold rounded-full py-2 transition-colors"
                >
                  <Download size={13} />
                  Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-line flex-shrink-0">
        <p className="text-subtle text-[11px] leading-relaxed">
          Recordings are held in this browser tab only. Download anything you want to keep before
          you leave the meeting or close the tab.
        </p>
      </div>
    </div>
  )
}
