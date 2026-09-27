'use client'

import { useMemo, useState } from 'react'
import {
  Crown,
  Mic,
  Hand,
  Lock,
  MicOff,
  MonitorUp,
  MoreVertical,
  Radio,
  Search,
  Unlock,
  UserMinus,
  Video,
  VideoOff,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { PeerState } from '@/types'

interface ParticipantsPanelProps {
  localName: string
  localSocketId: string
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isHandRaised: boolean
  isScreenSharing: boolean
  isRecordingLocally: boolean
  peers: Map<string, PeerState>
  isOwner: boolean
  ownerId: string | null
  isLocked: boolean
  maxParticipants: number
  speakingIds: Record<string, boolean>
  onKick: (socketId: string) => void
  onMute: (socketId: string) => void
  onMuteAll: () => void
  onMakeHost: (socketId: string) => void
  onSetLocked: (locked: boolean) => void
  onClose: () => void
}

function Avatar({ name, isSpeaking }: { name: string; isSpeaking: boolean }) {
  const initials =
    name
      .split(/\s+/)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'

  return (
    <div
      className={clsx(
        'w-8 h-8 rounded-full bg-avatar flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 select-none transition-shadow',
        isSpeaking && 'ring-2 ring-accent'
      )}
    >
      {initials}
    </div>
  )
}

interface RowProps {
  socketId: string
  name: string
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isHandRaised: boolean
  isScreenSharing: boolean
  isRecording: boolean
  isSpeaking: boolean
  isLocal: boolean
  isHost: boolean
  canModerate: boolean
  onKick: () => void
  onMute: () => void
  onMakeHost: () => void
}

function ParticipantRow({
  name,
  isAudioEnabled,
  isVideoEnabled,
  isHandRaised,
  isScreenSharing,
  isRecording,
  isSpeaking,
  isLocal,
  isHost,
  canModerate,
  onKick,
  onMute,
  onMakeHost,
}: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="group relative flex items-center gap-3 px-3 py-2 mx-2 rounded-lg hover:bg-elevated transition-colors">
      <Avatar name={name} isSpeaking={isSpeaking} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-white text-sm truncate">{name}</span>
          {isLocal && <span className="text-muted text-xs flex-shrink-0">(You)</span>}
          {isHost && (
            <span title="Host" className="flex-shrink-0">
              <Crown size={11} className="text-yellow-400" />
            </span>
          )}
        </div>
        {(isScreenSharing || isRecording) && (
          <div className="flex items-center gap-2 mt-0.5">
            {isScreenSharing && (
              <span className="flex items-center gap-1 text-accent text-[10px] font-medium">
                <MonitorUp size={9} />
                Presenting
              </span>
            )}
            {isRecording && (
              <span className="flex items-center gap-1 text-red-400 text-[10px] font-medium">
                <Radio size={9} />
                Recording
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isHandRaised && <Hand size={13} className="text-yellow-400" />}
        {isAudioEnabled ? (
          <Mic size={13} className="text-muted" aria-label="Microphone on" />
        ) : (
          <MicOff size={13} className="text-red-400" aria-label="Muted" />
        )}
        {isVideoEnabled ? (
          <Video size={13} className="text-muted" aria-label="Camera on" />
        ) : (
          <VideoOff size={13} className="text-red-400" aria-label="Camera off" />
        )}

        {canModerate && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((value) => !value)}
              title={`Manage ${name}`}
              className="p-1 rounded-full text-muted hover:text-white hover:bg-avatar transition-colors"
            >
              <MoreVertical size={14} />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-surface border border-line rounded-lg shadow-2xl py-1">
                  <button
                    onClick={() => {
                      onMute()
                      setMenuOpen(false)
                    }}
                    disabled={!isAudioEnabled}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-elevated disabled:text-subtle disabled:hover:bg-transparent transition-colors"
                  >
                    <MicOff size={13} />
                    Mute for everyone
                  </button>
                  <button
                    onClick={() => {
                      onMakeHost()
                      setMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-elevated transition-colors"
                  >
                    <Crown size={13} />
                    Make host
                  </button>
                  <button
                    onClick={() => {
                      onKick()
                      setMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <UserMinus size={13} />
                    Remove from call
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function ParticipantsPanel({
  localName,
  localSocketId,
  isAudioEnabled,
  isVideoEnabled,
  isHandRaised,
  isScreenSharing,
  isRecordingLocally,
  peers,
  isOwner,
  ownerId,
  isLocked,
  maxParticipants,
  speakingIds,
  onKick,
  onMute,
  onMuteAll,
  onMakeHost,
  onSetLocked,
  onClose,
}: ParticipantsPanelProps) {
  const [query, setQuery] = useState('')

  const peerArray = useMemo(() => Array.from(peers.values()), [peers])
  const total = peerArray.length + 1

  // Raised hands first, then presenters, then alphabetically.
  const sorted = useMemo(() => {
    const filtered = peerArray.filter((peer) =>
      peer.name.toLowerCase().includes(query.trim().toLowerCase())
    )
    return filtered.sort((a, b) => {
      if (a.isHandRaised !== b.isHandRaised) return a.isHandRaised ? -1 : 1
      if (a.isScreenSharing !== b.isScreenSharing) return a.isScreenSharing ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [peerArray, query])

  const raisedHands = peerArray.filter((peer) => peer.isHandRaised).length + (isHandRaised ? 1 : 0)
  const selfMatches = localName.toLowerCase().includes(query.trim().toLowerCase())

  return (
    <div className="w-full sm:w-80 bg-surface h-full flex flex-col sm:border-l border-line panel-enter">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-line flex-shrink-0">
        <h2 className="text-white font-medium">
          Participants <span className="text-muted font-normal">({total}/{maxParticipants})</span>
        </h2>
        <button
          onClick={onClose}
          className="text-muted hover:text-white p-1 rounded transition-colors"
          aria-label="Close participants"
        >
          <X size={18} />
        </button>
      </div>

      {/* Host tools */}
      {isOwner && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line flex-shrink-0">
          <button
            onClick={onMuteAll}
            disabled={peerArray.length === 0}
            className="flex items-center gap-1.5 bg-elevated hover:bg-avatar disabled:opacity-40 disabled:hover:bg-elevated text-primary text-xs font-medium rounded-full px-3 py-1.5 transition-colors"
          >
            <MicOff size={12} />
            Mute all
          </button>
          <button
            onClick={() => onSetLocked(!isLocked)}
            className={clsx(
              'flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 transition-colors',
              isLocked
                ? 'bg-amber-400/15 text-amber-300 hover:bg-amber-400/25'
                : 'bg-elevated hover:bg-avatar text-primary'
            )}
          >
            {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
            {isLocked ? 'Locked' : 'Lock'}
          </button>
        </div>
      )}

      {raisedHands > 0 && (
        <div className="px-4 py-2 bg-yellow-400/10 border-b border-yellow-400/20 flex items-center gap-2 flex-shrink-0">
          <Hand size={13} className="text-yellow-400" />
          <span className="text-yellow-200 text-xs">
            {raisedHands} raised {raisedHands === 1 ? 'hand' : 'hands'}
          </span>
        </div>
      )}

      {total > 6 && (
        <div className="px-3 py-2 flex-shrink-0">
          <div className="flex items-center gap-2 bg-elevated rounded-lg px-2.5 py-1.5">
            <Search size={13} className="text-muted flex-shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find someone"
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder-muted min-w-0"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1.5">
        {selfMatches && (
          <ParticipantRow
            socketId={localSocketId}
            name={localName}
            isAudioEnabled={isAudioEnabled}
            isVideoEnabled={isVideoEnabled}
            isHandRaised={isHandRaised}
            isScreenSharing={isScreenSharing}
            isRecording={isRecordingLocally}
            isSpeaking={!!speakingIds.local}
            isLocal
            isHost={ownerId === localSocketId}
            canModerate={false}
            onKick={() => {}}
            onMute={() => {}}
            onMakeHost={() => {}}
          />
        )}

        {sorted.map((peer) => (
          <ParticipantRow
            key={peer.socketId}
            socketId={peer.socketId}
            name={peer.name}
            isAudioEnabled={peer.isAudioEnabled}
            isVideoEnabled={peer.isVideoEnabled}
            isHandRaised={peer.isHandRaised}
            isScreenSharing={peer.isScreenSharing}
            isRecording={peer.isRecording}
            isSpeaking={!!speakingIds[peer.socketId]}
            isLocal={false}
            isHost={ownerId === peer.socketId}
            canModerate={isOwner}
            onKick={() => onKick(peer.socketId)}
            onMute={() => onMute(peer.socketId)}
            onMakeHost={() => onMakeHost(peer.socketId)}
          />
        ))}

        {peerArray.length === 0 && (
          <p className="text-muted text-sm text-center px-6 mt-6 leading-relaxed">
            You are the only one here. Share the meeting link to invite up to{' '}
            {maxParticipants - 1} more people.
          </p>
        )}
      </div>
    </div>
  )
}
