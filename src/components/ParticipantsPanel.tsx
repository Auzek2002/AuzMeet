'use client'

import { Mic, MicOff, Video, VideoOff, Hand, X } from 'lucide-react'
import { PeerState } from '@/types'

interface ParticipantsPanelProps {
  localName: string
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isHandRaised: boolean
  peers: Map<string, PeerState>
  onClose: () => void
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((n) => n[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)
  return (
    <div className="w-8 h-8 rounded-full bg-[#5f6368] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 select-none">
      {initials || '?'}
    </div>
  )
}

function ParticipantRow({
  name,
  isAudioEnabled,
  isVideoEnabled,
  isHandRaised = false,
  isLocal = false,
}: {
  name: string
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isHandRaised?: boolean
  isLocal?: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#3c4043] rounded-lg mx-2 transition-colors">
      <Avatar name={name} />
      <span className="text-white text-sm flex-1 truncate">
        {name}
        {isLocal && (
          <span className="text-[#9aa0a6] text-xs ml-1">(You)</span>
        )}
      </span>
      <div className="flex items-center gap-1.5">
        {isHandRaised && <Hand size={14} className="text-yellow-400" />}
        {isAudioEnabled ? (
          <Mic size={14} className="text-[#9aa0a6]" />
        ) : (
          <MicOff size={14} className="text-red-400" />
        )}
        {isVideoEnabled ? (
          <Video size={14} className="text-[#9aa0a6]" />
        ) : (
          <VideoOff size={14} className="text-red-400" />
        )}
      </div>
    </div>
  )
}

export function ParticipantsPanel({
  localName,
  isAudioEnabled,
  isVideoEnabled,
  isHandRaised,
  peers,
  onClose,
}: ParticipantsPanelProps) {
  const peerArray = Array.from(peers.values())
  const total = peerArray.length + 1

  return (
    <div className="w-72 bg-[#292a2d] h-full flex flex-col border-l border-[#3c4043] panel-enter">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#3c4043]">
        <h2 className="text-white font-medium">
          Participants&nbsp;
          <span className="text-[#9aa0a6] font-normal">({total})</span>
        </h2>
        <button
          onClick={onClose}
          className="text-[#9aa0a6] hover:text-white p-1 rounded transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Local user */}
        <ParticipantRow
          name={localName}
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
          isHandRaised={isHandRaised}
          isLocal
        />

        {/* Remote peers */}
        {peerArray.map((peer) => (
          <ParticipantRow
            key={peer.socketId}
            name={peer.name}
            isAudioEnabled={peer.isAudioEnabled}
            isVideoEnabled={peer.isVideoEnabled}
            isHandRaised={peer.isHandRaised}
          />
        ))}
      </div>
    </div>
  )
}
