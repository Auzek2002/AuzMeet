'use client'

import { useEffect, useState } from 'react'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  Hand,
  Users,
  MessageSquare,
  PhoneOff,
  Info,
  MoreVertical,
} from 'lucide-react'
import { clsx } from 'clsx'

interface ControlBarProps {
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isScreenSharing: boolean
  isHandRaised: boolean
  onToggleAudio: () => void
  onToggleVideo: () => void
  onToggleScreenShare: () => void
  onToggleHand: () => void
  onToggleParticipants: () => void
  onToggleChat: () => void
  onToggleInfo: () => void
  onLeave: () => void
  isParticipantsOpen: boolean
  isChatOpen: boolean
  isInfoOpen: boolean
  participantCount: number
}

function ControlBtn({
  onClick,
  active = false,
  danger = false,
  title,
  children,
  badge,
}: {
  onClick: () => void
  active?: boolean
  danger?: boolean
  title: string
  children: React.ReactNode
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        'relative p-3 rounded-full transition-all duration-150 focus:outline-none',
        danger
          ? 'bg-red-600 hover:bg-red-700 text-white'
          : active
          ? 'bg-[#8ab4f8] text-[#202124] hover:bg-[#a8c7fa]'
          : 'bg-[#3c4043] text-[#e8eaed] hover:bg-[#5f6368]'
      )}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-[#1a73e8] text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

export function ControlBar({
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  isHandRaised,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleHand,
  onToggleParticipants,
  onToggleChat,
  onToggleInfo,
  onLeave,
  isParticipantsOpen,
  isChatOpen,
  isInfoOpen,
  participantCount,
}: ControlBarProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="h-20 bg-[#202124] border-t border-[#3c4043] flex items-center justify-between px-4 md:px-8 flex-shrink-0">
      {/* Left: Timer */}
      <div className="w-28 hidden sm:flex items-center">
        <span className="text-[#e8eaed] text-sm font-mono tabular-nums">
          {formatElapsed(elapsed)}
        </span>
      </div>

      {/* Center: Primary controls */}
      <div className="flex items-center gap-2 md:gap-3">
        <ControlBtn
          onClick={onToggleAudio}
          active={!isAudioEnabled}
          title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
        >
          {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        </ControlBtn>

        <ControlBtn
          onClick={onToggleVideo}
          active={!isVideoEnabled}
          title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
        </ControlBtn>

        <ControlBtn
          onClick={onToggleScreenShare}
          active={isScreenSharing}
          title={isScreenSharing ? 'Stop presenting' : 'Present now'}
        >
          {isScreenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
        </ControlBtn>

        <ControlBtn
          onClick={onToggleHand}
          active={isHandRaised}
          title={isHandRaised ? 'Lower hand' : 'Raise hand'}
        >
          <Hand size={20} />
        </ControlBtn>

        <div className="w-px h-8 bg-[#3c4043] mx-1" />

        {/* Leave button */}
        <button
          onClick={onLeave}
          title="Leave call"
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-full px-4 py-2.5 font-medium text-sm transition-colors"
        >
          <PhoneOff size={18} />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>

      {/* Right: Panel toggles */}
      <div className="w-28 flex items-center justify-end gap-1">
        <ControlBtn
          onClick={onToggleInfo}
          active={isInfoOpen}
          title="Meeting details"
        >
          <Info size={20} />
        </ControlBtn>

        <ControlBtn
          onClick={onToggleParticipants}
          active={isParticipantsOpen}
          title="Participants"
          badge={participantCount}
        >
          <Users size={20} />
        </ControlBtn>

        <ControlBtn
          onClick={onToggleChat}
          active={isChatOpen}
          title="In-call messages"
        >
          <MessageSquare size={20} />
        </ControlBtn>
      </div>
    </div>
  )
}
