'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
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
    isOwner,
    ownerId,
    wasKicked,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    sendMessage,
    toggleHand,
    kickParticipant,
  } = useWebRTC({ roomId, socket, userName, initialStream })

  // Redirect to home if the local user was kicked
  useEffect(() => {
    if (wasKicked) {
      localStream?.getTracks().forEach((t) => t.stop())
      socket.disconnect()
      router.push('/?kicked=1')
    }
  }, [wasKicked, localStream, socket, router])

  // Determine who is currently screen sharing ('local' | peer socketId | null)
  const screenSharingSocketId = useMemo(() => {
    if (isScreenSharing) return 'local'
    for (const [socketId, peer] of peers) {
      if (peer.isScreenSharing) return socketId
    }
    return null
  }, [isScreenSharing, peers])

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
            screenSharingSocketId={screenSharingSocketId}
          />
        </div>

        {/* Side panel — full-screen overlay on mobile, side panel on sm+ */}
        {activePanel && (
          <>
            {/* Mobile backdrop: tapping it closes the panel */}
            <div
              className="fixed inset-0 z-30 bg-black/60 sm:hidden"
              onClick={() => setActivePanel(null)}
            />
            {/* Panel container: fixed full-height on mobile, flex child on sm+ */}
            <div className="fixed inset-y-0 right-0 z-40 w-full sm:relative sm:inset-auto sm:z-auto sm:w-auto">
              {activePanel === 'participants' && (
                <ParticipantsPanel
                  localName={userName}
                  localSocketId={socket.id ?? ''}
                  isAudioEnabled={isAudioEnabled}
                  isVideoEnabled={isVideoEnabled}
                  isHandRaised={isHandRaised}
                  peers={peers}
                  isOwner={isOwner}
                  ownerId={ownerId}
                  onKick={kickParticipant}
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
          </>
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
