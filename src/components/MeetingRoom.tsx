'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Socket } from 'socket.io-client'
import { Check, Copy, Users, X } from 'lucide-react'
import { LayoutMode, RecordingMode, Tile, Toast, ToastKind } from '@/types'
import { FrameSource } from '@/lib/recording'
import { surfaceDescription } from '@/lib/displayCapture'
import { SIGNALING_URL, isServerlessHost } from '@/lib/socket'
import { useWebRTC } from '@/hooks/useWebRTC'
import { useAudioLevels } from '@/hooks/useAudioLevels'
import { useRecorder } from '@/hooks/useRecorder'
import { useMediaDevices } from '@/hooks/useMediaDevices'
import { MeetingStage } from './MeetingStage'
import { ControlBar, SidePanel } from './ControlBar'
import { TopBar } from './TopBar'
import { ParticipantsPanel } from './ParticipantsPanel'
import { ChatPanel } from './ChatPanel'
import { InfoPanel } from './InfoPanel'
import { RecordingsPanel } from './RecordingsPanel'
import { PeerAudio } from './PeerAudio'
import { Toasts } from './Toasts'

interface MeetingRoomProps {
  roomId: string
  userName: string
  socket: Socket
  initialStream: MediaStream | null
}

/** The local participant's id in the tile/audio-level maps. */
const LOCAL_ID = 'local'

export function MeetingRoom({ roomId, userName, socket, initialStream }: MeetingRoomProps) {
  const router = useRouter()

  const [activePanel, setActivePanel] = useState<SidePanel>(null)
  const [layout, setLayout] = useState<LayoutMode>('auto')
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [hideSelfView, setHideSelfView] = useState(false)
  const [speakerId, setSpeakerId] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [readMessageCount, setReadMessageCount] = useState(0)
  const [isLeaving, setIsLeaving] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  // Dismissing the invite card keeps it gone for the rest of the meeting,
  // including if everyone leaves and you end up alone again.
  const [inviteDismissed, setInviteDismissed] = useState(false)

  // ── Toasts ───────────────────────────────────────────────────────────────
  const notify = useCallback((kind: ToastKind, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }])
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 5000)
  }, [])

  const dismissToast = useCallback(
    (id: string) => setToasts((prev) => prev.filter((toast) => toast.id !== id)),
    []
  )

  // ── Connection ───────────────────────────────────────────────────────────
  const {
    localStream,
    localScreenStream,
    peers,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    screenSurface,
    isHandRaised,
    messages,
    isOwner,
    ownerId,
    isLocked,
    maxParticipants,
    wasKicked,
    isConnected,
    signalingStatus,
    joinError,
    screenShareError,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    sendMessage,
    toggleHand,
    switchCamera,
    switchMicrophone,
    kickParticipant,
    muteParticipant,
    muteEveryone,
    makeHost,
    setLocked,
  } = useWebRTC({ roomId, socket, userName, initialStream, onNotice: notify })

  const devices = useMediaDevices(true)

  // ── Tiles ────────────────────────────────────────────────────────────────
  // A participant who is presenting contributes two tiles, so their camera and
  // their screen can be on screen at the same time.
  const tiles = useMemo<Tile[]>(() => {
    const list: Tile[] = [
      {
        id: LOCAL_ID,
        socketId: LOCAL_ID,
        name: userName,
        stream: localStream,
        kind: 'camera',
        isLocal: true,
        isAudioEnabled,
        isVideoEnabled,
        isHandRaised,
        isHost: isOwner,
        isRecording: false,
        quality: 'excellent',
      },
    ]

    if (isScreenSharing && localScreenStream) {
      list.push({
        id: `${LOCAL_ID}:screen`,
        socketId: LOCAL_ID,
        name: userName,
        stream: localScreenStream,
        kind: 'screen',
        isLocal: true,
        isAudioEnabled: true,
        isVideoEnabled: true,
        isHandRaised: false,
        isHost: isOwner,
        isRecording: false,
        quality: 'excellent',
      })
    }

    for (const peer of peers.values()) {
      list.push({
        id: peer.socketId,
        socketId: peer.socketId,
        name: peer.name,
        stream: peer.cameraStream,
        kind: 'camera',
        isLocal: false,
        isAudioEnabled: peer.isAudioEnabled,
        isVideoEnabled: peer.isVideoEnabled,
        isHandRaised: peer.isHandRaised,
        isHost: ownerId === peer.socketId,
        isRecording: peer.isRecording,
        quality: peer.quality,
      })

      if (peer.isScreenSharing) {
        list.push({
          id: `${peer.socketId}:screen`,
          socketId: peer.socketId,
          name: peer.name,
          stream: peer.screenStream,
          kind: 'screen',
          isLocal: false,
          isAudioEnabled: true,
          isVideoEnabled: true,
          isHandRaised: false,
          isHost: ownerId === peer.socketId,
          isRecording: false,
          quality: peer.quality,
        })
      }
    }

    return list
  }, [
    userName,
    localStream,
    localScreenStream,
    isAudioEnabled,
    isVideoEnabled,
    isHandRaised,
    isScreenSharing,
    isOwner,
    ownerId,
    peers,
  ])

  // ── Speaking detection ───────────────────────────────────────────────────
  const audioSources = useMemo(
    () => [
      { id: LOCAL_ID, stream: localStream },
      ...Array.from(peers.values()).map((peer) => ({
        id: peer.socketId,
        stream: peer.cameraStream,
      })),
    ],
    [localStream, peers]
  )
  const { levels, speakingIds, activeSpeakerId } = useAudioLevels(audioSources)

  // ── Recording ────────────────────────────────────────────────────────────
  // The recorder pulls the live tile list every frame, so people who join or
  // start presenting mid-recording are captured without restarting.
  const tilesRef = useRef(tiles)
  tilesRef.current = tiles
  const speakingRef = useRef(speakingIds)
  speakingRef.current = speakingIds
  const screenRef = useRef(localScreenStream)
  screenRef.current = localScreenStream
  const peersRef = useRef(peers)
  peersRef.current = peers
  const localStreamRef = useRef(localStream)
  localStreamRef.current = localStream

  const buildSources = useCallback(
    (): FrameSource[] =>
      tilesRef.current.map((tile) => ({
        id: tile.id,
        stream: tile.stream,
        label: tile.isLocal ? `${tile.name} (You)` : tile.name,
        isScreen: tile.kind === 'screen',
        showVideo: tile.kind === 'screen' || tile.isVideoEnabled,
        isMuted: tile.kind === 'camera' && !tile.isAudioEnabled,
        isSpeaking: !!speakingRef.current[tile.socketId],
      })),
    []
  )

  const buildAudioStreams = useCallback(() => {
    const streams: { id: string; stream: MediaStream }[] = []
    if (localStreamRef.current) streams.push({ id: LOCAL_ID, stream: localStreamRef.current })
    if (screenRef.current) streams.push({ id: `${LOCAL_ID}:screen`, stream: screenRef.current })
    for (const peer of peersRef.current.values()) {
      if (peer.cameraStream) streams.push({ id: peer.socketId, stream: peer.cameraStream })
      if (peer.isScreenSharing && peer.screenStream) {
        streams.push({ id: `${peer.socketId}:screen`, stream: peer.screenStream })
      }
    }
    return streams
  }, [])

  const handleRecordingChange = useCallback(
    (recording: boolean) => {
      socket.emit('recording-state', { isRecording: recording })
      notify(
        recording ? 'success' : 'info',
        recording
          ? 'Recording started — everyone in the meeting has been told'
          : 'Recording saved. Download it from the Recordings panel.'
      )
      if (!recording) setActivePanel('recordings')
    },
    [socket, notify]
  )

  const recorder = useRecorder({
    roomId,
    buildSources,
    buildAudioStreams,
    onRecordingChange: handleRecordingChange,
    onError: (message) => notify('error', message),
  })

  // ── Notifications for things other people do ─────────────────────────────
  const previousPeersRef = useRef<Map<string, { name: string; sharing: boolean; recording: boolean }>>(
    new Map()
  )

  useEffect(() => {
    const previous = previousPeersRef.current
    const current = new Map<string, { name: string; sharing: boolean; recording: boolean }>()

    for (const peer of peers.values()) {
      current.set(peer.socketId, {
        name: peer.name,
        sharing: peer.isScreenSharing,
        recording: peer.isRecording,
      })

      const before = previous.get(peer.socketId)
      if (!before) {
        notify('info', `${peer.name} joined`)
      } else {
        if (!before.sharing && peer.isScreenSharing) {
          notify('info', `${peer.name} started presenting`)
        }
        if (!before.recording && peer.isRecording) {
          notify('warning', `${peer.name} is recording this meeting`)
        }
      }
    }

    previous.forEach((before, socketId) => {
      if (!current.has(socketId)) notify('info', `${before.name} left`)
    })

    previousPeersRef.current = current
  }, [peers, notify])

  useEffect(() => {
    if (screenShareError) notify('error', screenShareError)
  }, [screenShareError, notify])

  // Say plainly what the picked surface exposes — "entire screen" and "one tab"
  // behave very differently once the user starts moving between tabs.
  const announcedShareRef = useRef(false)
  useEffect(() => {
    if (!isScreenSharing) {
      announcedShareRef.current = false
      return
    }
    if (screenSurface === 'unknown' || announcedShareRef.current) return
    announcedShareRef.current = true
    notify(screenSurface === 'monitor' ? 'success' : 'info', surfaceDescription(screenSurface))
  }, [isScreenSharing, screenSurface, notify])

  useEffect(() => {
    if (!joinError) return
    if (joinError.reason === 'room-full') {
      notify('error', `This meeting is full (${joinError.max ?? maxParticipants} people maximum).`)
    } else if (joinError.reason === 'room-locked') {
      notify('error', 'The host has locked this meeting.')
    } else {
      notify('error', 'That meeting code is not valid.')
    }
    const timer = setTimeout(() => router.push('/'), 3200)
    return () => clearTimeout(timer)
  }, [joinError, maxParticipants, notify, router])

  // ── Leaving ──────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    if (recorder.isRecording) void recorder.stop()
    localStream?.getTracks().forEach((track) => track.stop())
    localScreenStream?.getTracks().forEach((track) => track.stop())
    socket.emit('leave-room')
    socket.disconnect()
  }, [recorder, localStream, localScreenStream, socket])

  const handleLeave = useCallback(() => {
    if (recorder.isRecording) {
      const confirmed = window.confirm(
        'You are still recording. Leaving now stops the recording — download it from the Recordings panel before you go.'
      )
      if (!confirmed) return
    }
    setIsLeaving(true)
    teardown()
    router.push('/')
  }, [recorder.isRecording, teardown, router])

  useEffect(() => {
    if (!wasKicked) return
    localStream?.getTracks().forEach((track) => track.stop())
    localScreenStream?.getTracks().forEach((track) => track.stop())
    socket.disconnect()
    router.push('/?kicked=1')
  }, [wasKicked, localStream, localScreenStream, socket, router])

  // Disconnect if the user navigates away without pressing Leave.
  useEffect(() => {
    return () => {
      socket.emit('leave-room')
      socket.disconnect()
    }
  }, [socket])

  // ── Panels ───────────────────────────────────────────────────────────────
  const togglePanel = useCallback((panel: Exclude<SidePanel, null>) => {
    setActivePanel((prev) => (prev === panel ? null : panel))
  }, [])

  // Mirrors activePanel for event handlers that must read it synchronously.
  const activePanelRef = useRef(activePanel)
  activePanelRef.current = activePanel

  // Chat badge clears while the chat is open.
  useEffect(() => {
    if (activePanel === 'chat') setReadMessageCount(messages.length)
  }, [activePanel, messages.length])

  const unreadCount = useMemo(() => {
    if (activePanel === 'chat') return 0
    return messages
      .slice(readMessageCount)
      .filter((message) => !message.system && message.senderId !== socket.id).length
  }, [messages, readMessageCount, activePanel, socket.id])

  // ── Screen share ─────────────────────────────────────────────────────────
  const handleToggleScreenShare = useCallback(() => {
    if (isScreenSharing) {
      stopScreenShare()
      notify('info', 'You stopped presenting')
    } else {
      void startScreenShare()
    }
  }, [isScreenSharing, startScreenShare, stopScreenShare, notify])

  const handleTogglePin = useCallback((id: string) => {
    setPinnedId((current) => (current === id ? null : id))
  }, [])

  const handleStartRecording = useCallback(
    (mode: RecordingMode) => void recorder.start(mode),
    [recorder]
  )
  const handleStopRecording = useCallback(() => void recorder.stop(), [recorder])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      // Never hijack keys while the user is typing.
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      // Escape backs out of whatever is open: the panel first, then the card.
      // The panel is read from a ref because a setState updater does not run
      // synchronously, so its result cannot decide what else to close here.
      if (event.key === 'Escape') {
        if (activePanelRef.current) setActivePanel(null)
        else setInviteDismissed(true)
        return
      }

      switch (event.key.toLowerCase()) {
        case 'm':
          event.preventDefault()
          toggleAudio()
          break
        case 'v':
          event.preventDefault()
          toggleVideo()
          break
        case 's':
          event.preventDefault()
          handleToggleScreenShare()
          break
        case 'h':
          event.preventDefault()
          toggleHand()
          break
        case 'c':
          event.preventDefault()
          togglePanel('chat')
          break
        case 'p':
          event.preventDefault()
          togglePanel('participants')
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleAudio, toggleVideo, toggleHand, handleToggleScreenShare, togglePanel])

  // ── Derived display values ───────────────────────────────────────────────
  const participantCount = peers.size + 1
  const someoneIsSharing = tiles.some((tile) => tile.kind === 'screen')
  const showInviteCard = participantCount === 1 && !someoneIsSharing && !inviteDismissed

  const recordingBy = useMemo(() => {
    const names: string[] = []
    if (recorder.isRecording) names.push(userName)
    peers.forEach((peer) => {
      if (peer.isRecording) names.push(peer.name)
    })
    return names
  }, [recorder.isRecording, peers, userName])

  const copyInvite = useCallback(async () => {
    const link = `${window.location.origin}/meeting/${roomId}`
    try {
      await navigator.clipboard.writeText(link)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      notify('error', 'Could not copy the link — use the meeting details panel.')
    }
  }, [roomId, notify])

  if (isLeaving) {
    return (
      <div className="h-screen w-screen bg-app flex items-center justify-center">
        <p className="text-muted text-sm">Leaving the meeting…</p>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-app flex flex-col overflow-hidden">
      <Toasts toasts={toasts} onDismiss={dismissToast} />

      {/* Audio playback lives outside the tiles so nobody goes silent when a
          tile is not on screen. */}
      <PeerAudio peers={peers} sinkId={speakerId || undefined} />

      {/* Signaling is down: media already flowing keeps going, but the roster
          is frozen until it returns. */}
      {signalingStatus === 'reconnecting' && (
        <div
          role="status"
          className="flex-shrink-0 flex items-center justify-center gap-2 bg-amber-500/15 border-b border-amber-500/30 px-4 py-1.5 text-amber-200 text-xs font-medium"
        >
          <span className="w-3 h-3 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
          Reconnecting… people cannot join or leave until the connection is back.
        </div>
      )}

      {/* Terminal: the signaling server never answered. Retrying forever would
          just spin, so say what is wrong and what to do about it. */}
      {signalingStatus === 'unreachable' && (
        <div
          role="alert"
          className="flex-shrink-0 bg-danger/15 border-b border-danger/40 px-4 py-2.5 text-red-200 text-xs"
        >
          <p className="font-semibold mb-0.5">Can&apos;t reach the meeting server.</p>
          <p className="text-red-200/85 leading-relaxed">
            {isServerlessHost() && !SIGNALING_URL ? (
              <>
                This site is hosted on a serverless platform, which cannot run the
                signaling server — it needs a process that stays alive. Deploy{' '}
                <code className="font-mono">signaling-server.js</code> somewhere persistent and
                set <code className="font-mono">NEXT_PUBLIC_SIGNALING_URL</code>. See
                DEPLOYMENT.md.
              </>
            ) : (
              <>
                The signaling server at{' '}
                <code className="font-mono">{SIGNALING_URL || 'this site'}</code> did not
                respond. Check that it is running and reachable, then reload.
              </>
            )}
          </p>
        </div>
      )}

      <TopBar
        roomId={roomId}
        participantCount={participantCount}
        maxParticipants={maxParticipants}
        layout={layout}
        onLayoutChange={setLayout}
        isLocked={isLocked}
        sharingSurface={isScreenSharing ? screenSurface : null}
        recordingBy={recordingBy}
        isRecordingLocally={recorder.isRecording}
        recordingElapsedMs={recorder.elapsedMs}
        onStopRecording={handleStopRecording}
      />

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 relative">
          <MeetingStage
            tiles={tiles}
            layout={layout}
            pinnedId={pinnedId}
            onTogglePin={handleTogglePin}
            speakingIds={speakingIds}
            levels={levels}
            activeSpeakerId={activeSpeakerId}
            hideSelfView={hideSelfView}
          />

          {/* Gentle nudge to invite people while alone in the room */}
          {showInviteCard && (
            <div
              aria-label="Invite people to this meeting"
              className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[min(92vw,22rem)] bg-surface/95 backdrop-blur border border-line rounded-xl px-4 py-3 shadow-2xl"
            >
              <button
                onClick={() => setInviteDismissed(true)}
                title="Dismiss"
                aria-label="Dismiss invite prompt"
                className="absolute top-2 right-2 text-muted hover:text-white hover:bg-elevated rounded-md p-1 transition-colors touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X size={14} />
              </button>

              <p className="text-white text-sm font-medium flex items-center gap-2 pr-6">
                <Users size={14} className="text-accent flex-shrink-0" />
                You are the only one here
              </p>
              <p className="text-muted text-xs mt-1 mb-2.5 leading-relaxed">
                Share the link and up to {maxParticipants - 1} more people can join this call.
              </p>
              <button
                onClick={copyInvite}
                className="w-full flex items-center justify-center gap-1.5 bg-accent-strong hover:bg-accent-strong-hover text-white text-xs font-semibold rounded-full py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {linkCopied ? <Check size={13} /> : <Copy size={13} />}
                {linkCopied ? 'Link copied' : 'Copy meeting link'}
              </button>
              <p className="text-subtle text-[11px] text-center mt-1.5">
                You can always copy it again from Meeting details.
              </p>
            </div>
          )}
        </div>

        {/* Side panel: overlay on phones, docked column from sm up */}
        {activePanel && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/60 sm:hidden"
              onClick={() => setActivePanel(null)}
            />
            <div className="fixed inset-y-0 right-0 z-40 w-full sm:relative sm:inset-auto sm:z-auto sm:w-auto">
              {activePanel === 'participants' && (
                <ParticipantsPanel
                  localName={userName}
                  localSocketId={socket.id ?? ''}
                  isAudioEnabled={isAudioEnabled}
                  isVideoEnabled={isVideoEnabled}
                  isHandRaised={isHandRaised}
                  isScreenSharing={isScreenSharing}
                  isRecordingLocally={recorder.isRecording}
                  peers={peers}
                  isOwner={isOwner}
                  ownerId={ownerId}
                  isLocked={isLocked}
                  maxParticipants={maxParticipants}
                  speakingIds={speakingIds}
                  onKick={kickParticipant}
                  onMute={muteParticipant}
                  onMuteAll={muteEveryone}
                  onMakeHost={makeHost}
                  onSetLocked={setLocked}
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
                <InfoPanel
                  roomId={roomId}
                  participantCount={participantCount}
                  maxParticipants={maxParticipants}
                  isLocked={isLocked}
                  speakers={devices.speakers}
                  selectedSpeakerId={speakerId}
                  onSelectSpeaker={setSpeakerId}
                  hideSelfView={hideSelfView}
                  onToggleSelfView={() => setHideSelfView((value) => !value)}
                  onClose={() => setActivePanel(null)}
                />
              )}
              {activePanel === 'recordings' && (
                <RecordingsPanel
                  recordings={recorder.recordings}
                  supported={recorder.supported}
                  isRecording={recorder.isRecording}
                  isPaused={recorder.isPaused}
                  elapsedMs={recorder.elapsedMs}
                  activeMode={recorder.mode}
                  someoneIsSharing={someoneIsSharing}
                  onStart={handleStartRecording}
                  onStop={handleStopRecording}
                  onPause={recorder.pause}
                  onResume={recorder.resume}
                  onRemove={recorder.remove}
                  onClose={() => setActivePanel(null)}
                />
              )}
            </div>
          </>
        )}
      </div>

      <ControlBar
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        isScreenSharing={isScreenSharing}
        isHandRaised={isHandRaised}
        hasAudioTrack={!!localStream?.getAudioTracks().length}
        hasVideoTrack={!!localStream?.getVideoTracks().length}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={handleToggleScreenShare}
        onToggleHand={toggleHand}
        onLeave={handleLeave}
        cameras={devices.cameras}
        microphones={devices.microphones}
        onSelectCamera={switchCamera}
        onSelectMicrophone={switchMicrophone}
        recordingSupported={recorder.supported}
        isRecording={recorder.isRecording}
        isRecordingPaused={recorder.isPaused}
        recordingElapsedMs={recorder.elapsedMs}
        recordingCount={recorder.recordings.length}
        someoneIsSharing={someoneIsSharing}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onPauseRecording={recorder.pause}
        onResumeRecording={recorder.resume}
        activePanel={activePanel}
        onTogglePanel={togglePanel}
        participantCount={participantCount}
        unreadCount={unreadCount}
      />
    </div>
  )
}
