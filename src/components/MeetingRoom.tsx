'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Socket } from 'socket.io-client'
import { useWebRTC } from '@/hooks/useWebRTC'
import { VideoGrid } from './VideoGrid'
import { ControlBar } from './ControlBar'
import { ParticipantsPanel } from './ParticipantsPanel'
import { ChatPanel } from './ChatPanel'
import { InfoPanel } from './InfoPanel'

type SidePanel = 'participants' | 'chat' | 'info' | null

interface MeetingRoomProps {
  roomId: string
  userName: string
  socket: Socket
  initialStream: MediaStream | null
}

export function MeetingRoom({
  roomId,
  userName,
  socket,
  initialStream,
}: MeetingRoomProps) {
  const router = useRouter()
  const [activePanel, setActivePanel] = useState<SidePanel>(null)

  const {
    localStream,
    peers,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    messages,
    isHandRaised,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    sendMessage,
    toggleHand,
  } = useWebRTC({ roomId, socket, userName, initialStream })

  const handleToggleScreenShare = useCallback(() => {
    if (isScreenSharing) {
      stopScreenShare()
    } else {
      startScreenShare()
    }
  }, [isScreenSharing, startScreenShare, stopScreenShare])

  const handleLeave = useCallback(() => {
    // Stop all local media tracks
    localStream?.getTracks().forEach((t) => t.stop())
    socket.disconnect()
    router.push('/')
  }, [localStream, socket, router])

  const togglePanel = useCallback((panel: SidePanel) => {
    setActivePanel((prev) => (prev === panel ? null : panel))
  }, [])

  // Cleanup when navigating away without clicking Leave
  useEffect(() => {
    return () => {
      socket.disconnect()
    }
  }, [socket])

  return (
    <div className="h-screen w-screen bg-[#202124] flex flex-col overflow-hidden">
      {/* ── Main area: video grid + optional side panel ── */}
      <div className="flex-1 flex min-h-0">
        {/* Video grid */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <VideoGrid
            localStream={localStream}
            localName={userName}
            isAudioEnabled={isAudioEnabled}
            isVideoEnabled={isVideoEnabled}
            peers={peers}
          />
        </div>

        {/* Side panel */}
        {activePanel === 'participants' && (
          <ParticipantsPanel
            localName={userName}
            isAudioEnabled={isAudioEnabled}
            isVideoEnabled={isVideoEnabled}
            isHandRaised={isHandRaised}
            peers={peers}
            onClose={() => setActivePanel(null)}
          />
        )}
        {activePanel === 'chat' && (
          <ChatPanel
            messages={messages}
            onSendMessage={sendMessage}
            onClose={() => setActivePanel(null)}
            localSocketId={socket.id ?? ''}
          />
        )}
        {activePanel === 'info' && (
          <InfoPanel roomId={roomId} onClose={() => setActivePanel(null)} />
        )}
      </div>

      {/* ── Control bar ── */}
      <ControlBar
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        isScreenSharing={isScreenSharing}
        isHandRaised={isHandRaised}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={handleToggleScreenShare}
        onToggleHand={toggleHand}
        onToggleParticipants={() => togglePanel('participants')}
        onToggleChat={() => togglePanel('chat')}
        onToggleInfo={() => togglePanel('info')}
        onLeave={handleLeave}
        isParticipantsOpen={activePanel === 'participants'}
        isChatOpen={activePanel === 'chat'}
        isInfoOpen={activePanel === 'info'}
        participantCount={peers.size + 1}
      />
    </div>
  )
}
