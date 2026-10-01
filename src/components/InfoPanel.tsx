'use client'

import { useState } from 'react'
import { Check, Copy, Eye, EyeOff, Link2, Lock, Users, Volume2, X } from 'lucide-react'
import { clsx } from 'clsx'
import { DeviceOption } from '@/types'
import { supportsSpeakerSelection } from '@/hooks/useMediaDevices'

interface InfoPanelProps {
  roomId: string
  participantCount: number
  maxParticipants: number
  isLocked: boolean
  speakers: DeviceOption[]
  selectedSpeakerId: string
  onSelectSpeaker: (deviceId: string) => void
  hideSelfView: boolean
  onToggleSelfView: () => void
  onClose: () => void
}

export function InfoPanel({
  roomId,
  participantCount,
  maxParticipants,
  isLocked,
  speakers,
  selectedSpeakerId,
  onSelectSpeaker,
  hideSelfView,
  onToggleSelfView,
  onClose,
}: InfoPanelProps) {
  const [copied, setCopied] = useState(false)

  const meetingLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/meeting/${roomId}`
      : `/meeting/${roomId}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(meetingLink)
    } catch {
      const field = document.createElement('textarea')
      field.value = meetingLink
      document.body.appendChild(field)
      field.select()
      document.execCommand('copy')
      field.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const canChooseSpeaker = supportsSpeakerSelection() && speakers.length > 1

  return (
    <div className="w-full sm:w-80 bg-surface h-full flex flex-col sm:border-l border-line panel-enter overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-line flex-shrink-0">
        <h2 className="text-white font-medium">Meeting details</h2>
        <button
          onClick={onClose}
          className="text-muted hover:text-white p-1 rounded transition-colors"
          aria-label="Close meeting details"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-4 py-4 space-y-5">
        <div>
          <p className="text-muted text-[11px] font-semibold mb-2 uppercase tracking-wider">
            Joining info
          </p>
          <div className="flex items-center gap-2 bg-elevated rounded-xl px-3 py-3">
            <Link2 size={14} className="text-muted flex-shrink-0" />
            <span className="text-accent text-xs flex-1 truncate font-mono">{meetingLink}</span>
          </div>
          <div className="bg-elevated rounded-xl px-3 py-3 mt-2">
            <p className="text-muted text-[10px] uppercase tracking-wider mb-1">Meeting code</p>
            <span className="text-white text-sm font-mono tracking-widest">{roomId}</span>
          </div>
          <button
            onClick={copy}
            className="w-full flex items-center justify-center gap-2 bg-accent-strong hover:bg-accent-strong-hover text-white rounded-full px-4 py-2.5 text-sm font-medium transition-colors mt-3"
          >
            {copied ? (
              <>
                <Check size={14} />
                Copied
              </>
            ) : (
              <>
                <Copy size={14} />
                Copy joining info
              </>
            )}
          </button>
        </div>

        <div>
          <p className="text-muted text-[11px] font-semibold mb-2 uppercase tracking-wider">
            Room
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 text-sm">
              <Users size={14} className="text-muted flex-shrink-0" />
              <span className="text-primary">
                {participantCount} of {maxParticipants} people
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Lock size={14} className={clsx('flex-shrink-0', isLocked ? 'text-amber-400' : 'text-muted')} />
              <span className={isLocked ? 'text-amber-300' : 'text-primary'}>
                {isLocked ? 'Locked. Nobody new can join' : 'Open to anyone with the link'}
              </span>
            </div>
          </div>
        </div>

        <div>
          <p className="text-muted text-[11px] font-semibold mb-2 uppercase tracking-wider">
            Your view
          </p>

          <button
            onClick={onToggleSelfView}
            className="w-full flex items-center gap-2.5 bg-elevated hover:bg-avatar rounded-xl px-3 py-2.5 text-sm text-primary transition-colors"
          >
            {hideSelfView ? <EyeOff size={14} /> : <Eye size={14} />}
            {hideSelfView ? 'Show my video to me' : 'Hide my video from my own view'}
          </button>

          {canChooseSpeaker && (
            <div className="mt-2">
              <label className="flex items-center gap-2 text-muted text-xs mb-1.5 px-1">
                <Volume2 size={13} />
                Speaker
              </label>
              <select
                value={selectedSpeakerId}
                onChange={(event) => onSelectSpeaker(event.target.value)}
                className="w-full bg-elevated text-primary text-sm rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent"
              >
                {speakers.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <p className="text-muted text-[11px] font-semibold mb-2 uppercase tracking-wider">
            Shortcuts
          </p>
          <dl className="space-y-1.5 text-xs">
            {[
              ['M', 'Mute / unmute'],
              ['V', 'Camera on / off'],
              ['S', 'Present your screen'],
              ['H', 'Raise / lower hand'],
              ['C', 'Chat'],
              ['P', 'Participants'],
            ].map(([key, action]) => (
              <div key={key} className="flex items-center gap-2">
                <kbd className="bg-elevated text-primary rounded px-1.5 py-0.5 font-mono text-[10px] min-w-[20px] text-center">
                  {key}
                </kbd>
                <dd className="text-muted">{action}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
