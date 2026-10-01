'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'
import {
  ChatMessage,
  ConnectionQuality,
  PeerState,
  TranscriptEntry,
  UserInfo,
} from '@/types'
import {
  CaptureSurface,
  contentHintFor,
  onSurfaceChange,
  requestDisplayCapture,
  surfaceOf,
} from '@/lib/displayCapture'

/**
 * Plain `video: true` yields Chrome's 640x480 default, which looks soft on any
 * modern display. Ask for 720p, accept up to 1080p, and let it fall back on
 * hardware that can manage neither.
 */
export const CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
}

const STUN_ONLY: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

/**
 * One connection to a single remote participant.
 *
 * Camera tracks are added with addTrack so the two ends pair their m-lines up
 * normally. Screen tracks are added only while presenting, which triggers a
 * renegotiation round - perfect negotiation makes that safe even when both
 * sides start presenting at the same moment.
 */
/**
 * In a mesh each participant encodes its camera once per peer, so the cost
 * grows with the room. Sending a smaller, cheaper stream as the room fills
 * keeps a large call usable instead of saturating the CPU and stalling
 * everyone's video.
 */
function cameraEncodingFor(peerCount: number): { maxBitrate: number; scaleDownBy: number } {
  // Full 720p while the room is small; only start scaling down once the mesh
  // is genuinely expensive to encode.
  if (peerCount <= 2) return { maxBitrate: 2_500_000, scaleDownBy: 1 }
  if (peerCount <= 4) return { maxBitrate: 1_200_000, scaleDownBy: 1 }
  if (peerCount <= 8) return { maxBitrate: 700_000, scaleDownBy: 1.5 }
  return { maxBitrate: 400_000, scaleDownBy: 2 }
}

/**
 * A shared screen gets a far bigger budget than a camera: it is usually text,
 * and text is unreadable long before it merely looks soft. Still scaled by
 * room size, because in a mesh this is encoded and sent once per peer, and
 * saturating the uplink makes the picture worse for everyone.
 */
function screenEncodingFor(peerCount: number): number {
  if (peerCount <= 1) return 8_000_000
  if (peerCount <= 3) return 6_000_000
  if (peerCount <= 6) return 4_000_000
  return 2_500_000
}

/**
 * setParameters silently does nothing before the sender has encodings, which
 * is the case immediately after addTrack and before negotiation finishes - so
 * callers also re-apply this once the connection is up.
 */
async function applyEncoding(
  sender: RTCRtpSender,
  settings: { maxBitrate: number; scaleDownBy: number; screen: boolean }
): Promise<void> {
  try {
    const params = sender.getParameters()
    if (!params.encodings || params.encodings.length === 0) return
    params.encodings[0].maxBitrate = settings.maxBitrate
    params.encodings[0].scaleResolutionDownBy = settings.scaleDownBy
    // The single most important setting for a readable screen share: under
    // congestion, drop frames rather than resolution. The default ('balanced')
    // shrinks the picture instead, which is what turns shared text to mush.
    params.degradationPreference = settings.screen ? 'maintain-resolution' : 'balanced'
    await sender.setParameters(params)
  } catch {
    // Best-effort: the call still works at the browser's own defaults.
  }
}

async function applyCameraEncoding(sender: RTCRtpSender, peerCount: number): Promise<void> {
  const { maxBitrate, scaleDownBy } = cameraEncodingFor(peerCount)
  await applyEncoding(sender, { maxBitrate, scaleDownBy, screen: false })
}

async function applyScreenEncoding(sender: RTCRtpSender, peerCount: number): Promise<void> {
  await applyEncoding(sender, {
    maxBitrate: screenEncodingFor(peerCount),
    scaleDownBy: 1,
    screen: true,
  })
}

interface PeerConn {
  socketId: string
  pc: RTCPeerConnection
  /** Perfect negotiation: exactly one side of each pair is polite. */
  polite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
  isSettingRemoteAnswerPending: boolean
  camAudioSender: RTCRtpSender | null
  camVideoSender: RTCRtpSender | null
  screenSenders: RTCRtpSender[]
  /**
   * Candidates that arrived before a remote description existed. Adding one
   * then throws InvalidStateError, so they are held here and flushed as soon
   * as the description lands. More ICE servers means more candidates in
   * flight, which makes this race routine rather than rare.
   */
  pendingCandidates: RTCIceCandidateInit[]
}

/**
 * 'unreachable' is terminal: the signaling server never answered, which in a
 * deployment almost always means it is not running at all.
 */
export type SignalingStatus = 'connecting' | 'connected' | 'reconnecting' | 'unreachable'

export interface JoinError {
  reason: 'room-full' | 'room-locked' | 'invalid-room'
  max?: number
}

interface UseWebRTCProps {
  roomId: string
  socket: Socket
  userName: string
  initialStream: MediaStream | null
  /** Surfaces things the room should tell the user about, e.g. a host mute. */
  onNotice?: (kind: 'info' | 'success' | 'warning' | 'error', message: string) => void
}

export interface UseWebRTCReturn {
  localStream: MediaStream | null
  localScreenStream: MediaStream | null
  peers: Map<string, PeerState>
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isScreenSharing: boolean
  /** Which surface the local share is capturing: whole screen, window or tab. */
  screenSurface: CaptureSurface
  isHandRaised: boolean
  messages: ChatMessage[]
  transcript: TranscriptEntry[]
  /** What was already said when this user joined; empty if they were first. */
  missedTranscript: TranscriptEntry[]
  meetingStartedAt: string | null
  isOwner: boolean
  ownerId: string | null
  isLocked: boolean
  maxParticipants: number
  wasKicked: boolean
  /** False while the signaling socket is down and trying to reconnect. */
  isConnected: boolean
  signalingStatus: SignalingStatus
  /** False when no TURN relay is available from the server. */
  hasTurn: boolean
  relayWarning: string | null
  /** True once any peer connection has failed outright. */
  hadIceFailure: boolean
  joinError: JoinError | null
  screenShareError: string | null
  toggleAudio: () => void
  toggleVideo: () => void
  startScreenShare: () => Promise<void>
  stopScreenShare: () => void
  sendMessage: (message: string) => void
  toggleHand: () => void
  switchCamera: (deviceId: string) => Promise<void>
  switchMicrophone: (deviceId: string) => Promise<void>
  kickParticipant: (socketId: string) => void
  muteParticipant: (socketId: string) => void
  muteEveryone: () => void
  makeHost: (socketId: string) => void
  setLocked: (locked: boolean) => void
}

export function useWebRTC({
  roomId,
  socket,
  userName,
  initialStream,
  onNotice,
}: UseWebRTCProps): UseWebRTCReturn {
  // Held in a ref so a changing callback never re-runs the signaling effect.
  const noticeRef = useRef(onNotice)
  noticeRef.current = onNotice

  // ── Local media ──────────────────────────────────────────────────────────
  // Stable containers: device switches replace tracks inside them, so the
  // stream ids stay put for the whole call. The screen container's id is
  // announced to everyone, which is how the far end tells a presented screen
  // apart from a camera.
  const localStreamRef = useRef<MediaStream>()
  if (!localStreamRef.current) {
    localStreamRef.current = new MediaStream()
    initialStream?.getTracks().forEach((track) => localStreamRef.current!.addTrack(track))
  }
  const screenStreamRef = useRef<MediaStream>()
  if (!screenStreamRef.current) screenStreamRef.current = new MediaStream()
  const screenStreamId = screenStreamRef.current.id

  const [localStream, setLocalStream] = useState<MediaStream | null>(
    () => localStreamRef.current ?? null
  )
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null)
  const [peers, setPeers] = useState<Map<string, PeerState>>(new Map())

  const [isAudioEnabled, setIsAudioEnabled] = useState(
    () => initialStream?.getAudioTracks()[0]?.enabled ?? false
  )
  const [isVideoEnabled, setIsVideoEnabled] = useState(
    () => initialStream?.getVideoTracks()[0]?.enabled ?? false
  )
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isHandRaised, setIsHandRaised] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  // Lines that were already spoken when this user joined, kept separately so
  // the UI can offer to summarise exactly what they missed.
  const [missedTranscript, setMissedTranscript] = useState<TranscriptEntry[]>([])
  const [meetingStartedAt, setMeetingStartedAt] = useState<string | null>(null)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [maxParticipants, setMaxParticipants] = useState(16)
  const [wasKicked, setWasKicked] = useState(false)
  const [hadIceFailure, setHadIceFailure] = useState(false)
  const [joinError, setJoinError] = useState<JoinError | null>(null)
  const [screenShareError, setScreenShareError] = useState<string | null>(null)
  const [screenSurface, setScreenSurface] = useState<CaptureSurface>('unknown')
  const [selfId, setSelfId] = useState<string | null>(socket.id ?? null)
  const [isConnected, setIsConnected] = useState(socket.connected)
  // False when the server has no TURN relay: calls then only work between
  // people on the same network.
  const [hasTurn, setHasTurn] = useState(true)
  const [relayWarning, setRelayWarning] = useState<string | null>(null)
  const [signalingStatus, setSignalingStatus] = useState<SignalingStatus>(
    socket.connected ? 'connected' : 'connecting'
  )

  const peerConnsRef = useRef<Map<string, PeerConn>>(new Map())
  const iceServersRef = useRef<RTCIceServer[]>(STUN_ONLY)
  const mediaStateRef = useRef({ audio: isAudioEnabled, video: isVideoEnabled })
  mediaStateRef.current = { audio: isAudioEnabled, video: isVideoEnabled }
  const isSharingRef = useRef(false)

  /** Remote streams per peer, keyed by the stream id carried in the SDP. */
  const remoteStreamsRef = useRef<Map<string, Map<string, MediaStream>>>(new Map())
  /** Each peer's announced screen stream id, when they have one. */
  const remoteScreenIdsRef = useRef<Map<string, string | null>>(new Map())

  const patchPeer = useCallback((socketId: string, patch: Partial<PeerState>) => {
    setPeers((prev) => {
      const existing = prev.get(socketId)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(socketId, { ...existing, ...patch })
      return next
    })
  }, [])

  /**
   * Splits a peer's incoming streams into camera and screen. Identification is
   * by stream id: the screen is whichever stream matches the id that peer
   * announced, and the camera is the other one.
   */
  const recomputeStreams = useCallback(
    (socketId: string) => {
      const streams = remoteStreamsRef.current.get(socketId)
      const screenId = remoteScreenIdsRef.current.get(socketId) ?? null

      let cameraStream: MediaStream | null = null
      let screenStream: MediaStream | null = null

      if (streams) {
        for (const [id, stream] of streams) {
          if (screenId && id === screenId) screenStream = stream
          else if (!cameraStream) cameraStream = stream
        }
      }

      patchPeer(socketId, { cameraStream, screenStream })
    },
    [patchPeer]
  )

  // ── Peer connection factory ──────────────────────────────────────────────
  const createPeerConnection = useCallback(
    (remoteId: string, user: UserInfo): PeerConn => {
      const existing = peerConnsRef.current.get(remoteId)
      if (existing) return existing

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        iceCandidatePoolSize: 4,
        bundlePolicy: 'max-bundle',
      })

      const localId = socket.id ?? ''
      const conn: PeerConn = {
        socketId: remoteId,
        pc,
        // Deterministic and opposite on the two ends of every pair.
        polite: localId < remoteId,
        makingOffer: false,
        ignoreOffer: false,
        isSettingRemoteAnswerPending: false,
        camAudioSender: null,
        camVideoSender: null,
        screenSenders: [],
        pendingCandidates: [],
      }

      // Camera and microphone go on with addTrack, which lets the answering
      // side reuse its own transceivers for these m-lines instead of minting
      // extra one-way ones.
      const container = localStreamRef.current!
      const micTrack = container.getAudioTracks()[0]
      const camTrack = container.getVideoTracks()[0]
      if (micTrack) conn.camAudioSender = pc.addTrack(micTrack, container)
      if (camTrack) {
        conn.camVideoSender = pc.addTrack(camTrack, container)
        void applyCameraEncoding(conn.camVideoSender, peerConnsRef.current.size + 1)
      }

      // Someone joining mid-presentation needs the screen straight away.
      if (isSharingRef.current) {
        const screenContainer = screenStreamRef.current!
        screenContainer.getTracks().forEach((track) => {
          conn.screenSenders.push(pc.addTrack(track, screenContainer))
        })
      }

      pc.ontrack = (event) => {
        const [stream] = event.streams
        if (!stream) return

        let streams = remoteStreamsRef.current.get(remoteId)
        if (!streams) {
          streams = new Map()
          remoteStreamsRef.current.set(remoteId, streams)
        }
        streams.set(stream.id, stream)
        recomputeStreams(remoteId)

        // A stream that empties out (the far end stopped presenting) should
        // stop being offered as a surface to render.
        stream.addEventListener('removetrack', () => {
          if (stream.getTracks().length === 0) {
            remoteStreamsRef.current.get(remoteId)?.delete(stream.id)
            recomputeStreams(remoteId)
          }
        })
      }

      pc.onnegotiationneeded = async () => {
        try {
          conn.makingOffer = true
          await pc.setLocalDescription()
          socket.emit('signal', { target: remoteId, description: pc.localDescription })
        } catch (err) {
          console.error(`[WebRTC] negotiation failed with ${remoteId}:`, err)
        } finally {
          conn.makingOffer = false
        }
      }

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit('signal', { target: remoteId, candidate })
      }

      let recoveryTimer: ReturnType<typeof setTimeout> | undefined
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState
        if (state === 'failed') {
          pc.restartIce()
          return
        }
        // 'disconnected' often heals on its own; give it a moment, then force a
        // fresh gathering round rather than leaving someone's video frozen.
        if (state === 'disconnected') {
          clearTimeout(recoveryTimer)
          recoveryTimer = setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') pc.restartIce()
          }, 4000)
        } else {
          clearTimeout(recoveryTimer)
        }
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') setHadIceFailure(true)
        if (pc.connectionState === 'connected') {
          // Encodings exist only once negotiation completes, so anything set
          // at addTrack time may have been silently discarded.
          const peerCount = peerConnsRef.current.size
          if (conn.camVideoSender) void applyCameraEncoding(conn.camVideoSender, peerCount)
          const screenSender = conn.screenSenders.find((x) => x.track?.kind === 'video')
          if (screenSender) void applyScreenEncoding(screenSender, peerCount)
        }
        patchPeer(remoteId, {
          connectionState: pc.connectionState,
          quality:
            pc.connectionState === 'connected'
              ? 'good'
              : pc.connectionState === 'failed' || pc.connectionState === 'disconnected'
              ? 'lost'
              : 'connecting',
        })
      }

      peerConnsRef.current.set(remoteId, conn)
      remoteScreenIdsRef.current.set(remoteId, user.screenStreamId ?? null)

      setPeers((prev) => {
        const next = new Map(prev)
        next.set(remoteId, {
          socketId: remoteId,
          name: user.name,
          cameraStream: null,
          screenStream: null,
          isAudioEnabled: user.isAudioEnabled,
          isVideoEnabled: user.isVideoEnabled,
          isHandRaised: user.isHandRaised,
          isScreenSharing: user.isScreenSharing,
          isRecording: user.isRecording ?? false,
          isTranscribing: user.isTranscribing ?? false,
          quality: 'connecting',
          connectionState: pc.connectionState,
        })
        return next
      })

      return conn
    },
    [socket, patchPeer, recomputeStreams]
  )

  const detachPeer = useCallback((conn: PeerConn) => {
    conn.pc.ontrack = null
    conn.pc.onnegotiationneeded = null
    conn.pc.onicecandidate = null
    conn.pc.onconnectionstatechange = null
    conn.pc.oniceconnectionstatechange = null
    conn.pc.close()
  }, [])

  const closePeerConnection = useCallback(
    (remoteId: string) => {
      const conn = peerConnsRef.current.get(remoteId)
      if (conn) {
        detachPeer(conn)
        peerConnsRef.current.delete(remoteId)
      }
      remoteStreamsRef.current.delete(remoteId)
      remoteScreenIdsRef.current.delete(remoteId)
      setPeers((prev) => {
        if (!prev.has(remoteId)) return prev
        const next = new Map(prev)
        next.delete(remoteId)
        return next
      })
    },
    [detachPeer]
  )

  const closeAllPeers = useCallback(() => {
    peerConnsRef.current.forEach((conn) => detachPeer(conn))
    peerConnsRef.current.clear()
    remoteStreamsRef.current.clear()
    remoteScreenIdsRef.current.clear()
    setPeers(new Map())
  }, [detachPeer])

  // ── Signaling ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !roomId) return

    let cancelled = false
    let hasJoined = false

    const join = () => {
      socket.emit('join-room', {
        roomId,
        userName,
        mediaState: mediaStateRef.current,
        // Announced up front so peers can classify this stream the moment it
        // shows up, whenever presenting begins.
        screenStreamId,
      })
      hasJoined = true
    }

    // 'connect' fires on reconnects too. The server's room state is in memory,
    // so after a restart we tear everything down and re-join from scratch.
    const handleConnect = () => {
      setSelfId(socket.id ?? null)
      setIsConnected(true)
      setSignalingStatus('connected')
      if (!hasJoined) return
      closeAllPeers()
      join()
    }

    const handleRoomUsers = ({
      users: existing,
      ownerId: roomOwnerId,
      locked,
      maxParticipants: max,
      selfId: mySocketId,
    }: {
      users: UserInfo[]
      ownerId: string
      locked: boolean
      maxParticipants: number
      selfId: string
    }) => {
      if (cancelled) return
      setOwnerId(roomOwnerId)
      setIsLocked(!!locked)
      setSelfId(mySocketId ?? socket.id ?? null)
      if (max) setMaxParticipants(max)
      // Creating the connection adds tracks, which fires negotiationneeded and
      // sends the offer. Glare with a peer offering back is expected and
      // resolved by perfect negotiation.
      existing.forEach((user) => createPeerConnection(user.socketId, user))
    }

    const handleUserJoined = (user: UserInfo) => {
      if (cancelled) return
      createPeerConnection(user.socketId, user)
    }

    const handleSignal = async ({
      from,
      fromUser,
      description,
      candidate,
    }: {
      from: string
      fromUser: UserInfo
      description?: RTCSessionDescriptionInit
      candidate?: RTCIceCandidateInit
    }) => {
      if (cancelled) return
      const conn =
        peerConnsRef.current.get(from) ??
        (fromUser ? createPeerConnection(from, fromUser) : undefined)
      if (!conn) return
      const { pc } = conn

      try {
        if (description) {
          const readyForOffer =
            !conn.makingOffer &&
            (pc.signalingState === 'stable' || conn.isSettingRemoteAnswerPending)
          const offerCollision = description.type === 'offer' && !readyForOffer

          conn.ignoreOffer = !conn.polite && offerCollision
          if (conn.ignoreOffer) return

          conn.isSettingRemoteAnswerPending = description.type === 'answer'
          await pc.setRemoteDescription(description)
          conn.isSettingRemoteAnswerPending = false

          // Anything that arrived early can be applied now.
          if (conn.pendingCandidates.length > 0) {
            const queued = conn.pendingCandidates
            conn.pendingCandidates = []
            for (const pending of queued) {
              try {
                await pc.addIceCandidate(pending)
              } catch (err) {
                if (!conn.ignoreOffer) console.warn('[WebRTC] stale candidate dropped:', err)
              }
            }
          }

          if (description.type === 'offer') {
            await pc.setLocalDescription()
            socket.emit('signal', { target: from, description: pc.localDescription })
          }
        } else if (candidate) {
          // Hold candidates until there is something to attach them to.
          if (!pc.remoteDescription) {
            conn.pendingCandidates.push(candidate)
            return
          }
          try {
            await pc.addIceCandidate(candidate)
          } catch (err) {
            // Candidates that arrive for an offer we deliberately dropped are
            // expected to fail; anything else is a real error.
            if (!conn.ignoreOffer) throw err
          }
        }
      } catch (err) {
        console.error(`[WebRTC] signaling error with ${from}:`, err)
      }
    }

    const handleUserLeft = ({ socketId }: { socketId: string }) => closePeerConnection(socketId)

    const handleMediaState = ({
      socketId,
      audio,
      video,
    }: {
      socketId: string
      audio: boolean
      video: boolean
    }) => patchPeer(socketId, { isAudioEnabled: audio, isVideoEnabled: video })

    const handleHandRaised = ({ socketId, isRaised }: { socketId: string; isRaised: boolean }) =>
      patchPeer(socketId, { isHandRaised: isRaised })

    const handleScreenShare = ({
      socketId,
      isSharing,
      streamId,
    }: {
      socketId: string
      isSharing: boolean
      streamId?: string | null
    }) => {
      if (streamId) remoteScreenIdsRef.current.set(socketId, streamId)
      patchPeer(socketId, { isScreenSharing: isSharing })
      recomputeStreams(socketId)
    }

    const handleRecording = ({
      socketId,
      isRecording,
    }: {
      socketId: string
      isRecording: boolean
    }) => patchPeer(socketId, { isRecording })

    const handleMessage = (message: ChatMessage) => setMessages((prev) => [...prev, message])

    const handleTranscript = (entry: TranscriptEntry) =>
      setTranscript((prev) => [...prev, entry])

    // Sent once, right after joining a meeting that is already in progress.
    const handleTranscriptHistory = ({
      entries,
      meetingStartedAt: startedAt,
    }: {
      entries: TranscriptEntry[]
      meetingStartedAt?: string
      joinedAt?: string
    }) => {
      if (!Array.isArray(entries) || entries.length === 0) return
      setMissedTranscript(entries)
      if (startedAt) setMeetingStartedAt(startedAt)
      // Prepend, skipping anything already received in the race between the
      // history snapshot and the first live line.
      setTranscript((prev) => {
        const seen = new Set(prev.map((e) => e.id))
        return [...entries.filter((e) => !seen.has(e.id)), ...prev]
      })
    }

    const handleTranscribing = ({
      socketId,
      isTranscribing,
    }: {
      socketId: string
      isTranscribing: boolean
    }) => patchPeer(socketId, { isTranscribing })
    const handleOwnerChanged = ({ ownerId: next }: { ownerId: string }) => setOwnerId(next)
    const handleLockState = ({ locked }: { locked: boolean }) => setIsLocked(locked)
    const handleKicked = () => setWasKicked(true)
    const handleJoinError = (err: JoinError) => setJoinError(err)

    // Host asked us to mute: mute locally and broadcast the new state.
    const handleForceMute = ({ by }: { by?: string }) => {
      const track = localStreamRef.current?.getAudioTracks()[0]
      if (track && track.enabled) {
        track.enabled = false
        setIsAudioEnabled(false)
        socket.emit('media-state', { audio: false, video: mediaStateRef.current.video })
      }
      noticeRef.current?.('warning', `${by ?? 'The host'} muted your microphone`)
    }

    // Losing the signaling socket does not drop existing media, but nobody
    // can join or leave until it is back - the UI should say so.
    const handleDisconnect = () => {
      setIsConnected(false)
      setSignalingStatus('reconnecting')
    }

    // Every attempt failed. Retrying forever just leaves a spinner on screen,
    // so surface it as a real error with something actionable.
    const handleReconnectFailed = () => {
      setIsConnected(false)
      setSignalingStatus('unreachable')
    }

    // The very first connection never landing is the same situation.
    let failedAttempts = 0
    const handleConnectError = () => {
      failedAttempts += 1
      setIsConnected(false)
      setSignalingStatus((current) =>
        current === 'unreachable' ? current : failedAttempts >= 4 ? 'unreachable' : 'reconnecting'
      )
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)
    socket.io.on('reconnect_failed', handleReconnectFailed)
    socket.on('room-users', handleRoomUsers)
    socket.on('user-joined', handleUserJoined)
    socket.on('signal', handleSignal)
    socket.on('user-left', handleUserLeft)
    socket.on('user-media-state', handleMediaState)
    socket.on('user-hand-raised', handleHandRaised)
    socket.on('user-screen-share', handleScreenShare)
    socket.on('user-recording', handleRecording)
    socket.on('receive-message', handleMessage)
    socket.on('transcript', handleTranscript)
    socket.on('transcript-history', handleTranscriptHistory)
    socket.on('user-transcribing', handleTranscribing)
    socket.on('owner-changed', handleOwnerChanged)
    socket.on('room-lock-state', handleLockState)
    socket.on('kicked', handleKicked)
    socket.on('join-error', handleJoinError)
    socket.on('force-mute', handleForceMute)

    // Fetch TURN credentials before joining so the very first connection can
    // already fall back to a relay when a direct path is unavailable.
    const start = async () => {
      try {
        const res = await fetch('/api/turn-credentials')
        const data = await res.json()
        if (!cancelled && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          iceServersRef.current = data.iceServers
          if (data.hasTurn === false) {
            setHasTurn(false)
            setRelayWarning(data.warning ?? null)
          }
        }
      } catch (err) {
        console.warn('[TURN] falling back to STUN only:', err)
      }
      if (!cancelled) join()
    }
    void start()

    return () => {
      cancelled = true
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
      socket.io.off('reconnect_failed', handleReconnectFailed)
      socket.off('room-users', handleRoomUsers)
      socket.off('user-joined', handleUserJoined)
      socket.off('signal', handleSignal)
      socket.off('user-left', handleUserLeft)
      socket.off('user-media-state', handleMediaState)
      socket.off('user-hand-raised', handleHandRaised)
      socket.off('user-screen-share', handleScreenShare)
      socket.off('user-recording', handleRecording)
      socket.off('receive-message', handleMessage)
      socket.off('transcript', handleTranscript)
      socket.off('transcript-history', handleTranscriptHistory)
      socket.off('user-transcribing', handleTranscribing)
      socket.off('owner-changed', handleOwnerChanged)
      socket.off('room-lock-state', handleLockState)
      socket.off('kicked', handleKicked)
      socket.off('join-error', handleJoinError)
      socket.off('force-mute', handleForceMute)
      closeAllPeers()
    }
  }, [
    socket,
    roomId,
    userName,
    screenStreamId,
    createPeerConnection,
    closePeerConnection,
    closeAllPeers,
    patchPeer,
    recomputeStreams,
  ])

  // ── Adapt outbound camera quality to the size of the room ────────────────
  // Re-applied whenever someone joins or leaves, so a call that grows stays
  // affordable to encode and one that shrinks gets its quality back.
  useEffect(() => {
    const peerCount = peers.size
    peerConnsRef.current.forEach((conn) => {
      if (conn.camVideoSender) void applyCameraEncoding(conn.camVideoSender, peerCount)
      const screenSender = conn.screenSenders.find((x) => x.track?.kind === 'video')
      if (screenSender) void applyScreenEncoding(screenSender, peerCount)
    })
  }, [peers.size])

  // ── Connection quality sampling ──────────────────────────────────────────
  useEffect(() => {
    const previous = new Map<string, { lost: number; received: number }>()

    const interval = setInterval(async () => {
      for (const [id, conn] of peerConnsRef.current) {
        if (conn.pc.connectionState !== 'connected') continue
        try {
          const stats = await conn.pc.getStats()
          let lost = 0
          let received = 0
          let rtt = 0

          stats.forEach((report) => {
            if (report.type === 'inbound-rtp') {
              lost += report.packetsLost ?? 0
              received += report.packetsReceived ?? 0
            }
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              rtt = Math.max(rtt, (report.currentRoundTripTime ?? 0) * 1000)
            }
          })

          const before = previous.get(id) ?? { lost: 0, received: 0 }
          const deltaLost = Math.max(0, lost - before.lost)
          const deltaReceived = Math.max(0, received - before.received)
          previous.set(id, { lost, received })

          const lossRatio =
            deltaLost + deltaReceived > 0 ? deltaLost / (deltaLost + deltaReceived) : 0

          let quality: ConnectionQuality = 'excellent'
          if (lossRatio > 0.08 || rtt > 400) quality = 'poor'
          else if (lossRatio > 0.02 || rtt > 200) quality = 'good'

          patchPeer(id, { quality })
        } catch {
          // getStats can reject while a connection is tearing down.
        }
      }
    }, 4000)

    return () => clearInterval(interval)
  }, [patchPeer])

  // ── Local controls ───────────────────────────────────────────────────────
  const broadcastMediaState = useCallback(
    (audio: boolean, video: boolean) => socket.emit('media-state', { audio, video }),
    [socket]
  )

  /**
   * Swaps a camera/mic track into the stable container and onto every peer.
   * A participant who joined without that device has no sender yet, so one is
   * added - which renegotiates, exactly as it should.
   */
  const replaceLocalTrack = useCallback(
    (kind: 'audio' | 'video', track: MediaStreamTrack | null) => {
      const container = localStreamRef.current
      if (!container) return

      const current = kind === 'audio' ? container.getAudioTracks()[0] : container.getVideoTracks()[0]
      if (current) {
        current.stop()
        container.removeTrack(current)
      }
      if (track) container.addTrack(track)

      peerConnsRef.current.forEach((conn) => {
        const sender = kind === 'audio' ? conn.camAudioSender : conn.camVideoSender
        if (sender) {
          sender.replaceTrack(track).catch((err) => {
            console.error('[WebRTC] replaceTrack failed:', err)
          })
        } else if (track) {
          const added = conn.pc.addTrack(track, container)
          if (kind === 'audio') conn.camAudioSender = added
          else conn.camVideoSender = added
        }
      })

      // New object identity so dependent effects and <video> bindings refresh.
      setLocalStream(new MediaStream(container.getTracks()))
    },
    []
  )

  // Toggling a device that was never granted acquires it on the spot, so
  // joining without a camera or microphone is no longer a one-way door.
  const toggleAudio = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      setIsAudioEnabled(track.enabled)
      broadcastMediaState(track.enabled, mediaStateRef.current.video)
      return
    }

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const newTrack = stream.getAudioTracks()[0]
        if (!newTrack) return
        replaceLocalTrack('audio', newTrack)
        setIsAudioEnabled(true)
        broadcastMediaState(true, mediaStateRef.current.video)
      } catch {
        noticeRef.current?.('error', 'Could not access a microphone.')
      }
    })()
  }, [broadcastMediaState, replaceLocalTrack])

  const toggleVideo = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      setIsVideoEnabled(track.enabled)
      broadcastMediaState(mediaStateRef.current.audio, track.enabled)
      return
    }

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: CAMERA_CONSTRAINTS })
        const newTrack = stream.getVideoTracks()[0]
        if (!newTrack) return
        replaceLocalTrack('video', newTrack)
        setIsVideoEnabled(true)
        broadcastMediaState(mediaStateRef.current.audio, true)
      } catch {
        noticeRef.current?.('error', 'Could not access a camera.')
      }
    })()
  }, [broadcastMediaState, replaceLocalTrack])

  const switchCamera = useCallback(
    async (deviceId: string) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, ...CAMERA_CONSTRAINTS },
        })
        const track = stream.getVideoTracks()[0]
        if (!track) return
        track.enabled = mediaStateRef.current.video
        replaceLocalTrack('video', track)
      } catch (err) {
        console.error('[Media] could not switch camera:', err)
        noticeRef.current?.('error', 'Could not switch camera.')
      }
    },
    [replaceLocalTrack]
  )

  const switchMicrophone = useCallback(
    async (deviceId: string) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        })
        const track = stream.getAudioTracks()[0]
        if (!track) return
        track.enabled = mediaStateRef.current.audio
        replaceLocalTrack('audio', track)
      } catch (err) {
        console.error('[Media] could not switch microphone:', err)
        noticeRef.current?.('error', 'Could not switch microphone.')
      }
    },
    [replaceLocalTrack]
  )

  // ── Screen share ─────────────────────────────────────────────────────────
  // The screen travels on its own m-lines, independent of the camera, so the
  // camera keeps streaming the whole time a screen is being presented.
  const stopScreenShare = useCallback(() => {
    const container = screenStreamRef.current
    if (!container) return

    peerConnsRef.current.forEach((conn) => {
      conn.screenSenders.forEach((sender) => {
        try {
          conn.pc.removeTrack(sender)
        } catch {
          // The connection may already be closing.
        }
      })
      conn.screenSenders = []
    })

    container.getTracks().forEach((track) => {
      track.stop()
      container.removeTrack(track)
    })

    isSharingRef.current = false
    setIsScreenSharing(false)
    setScreenSurface('unknown')
    setLocalScreenStream(null)
    socket.emit('screen-share', { isSharing: false, streamId: container.id })
  }, [socket])

  const startScreenShare = useCallback(async () => {
    setScreenShareError(null)
    try {
      // Prefers the whole monitor in the picker and asks for full desktop
      // resolution; see lib/displayCapture for the constraint set.
      const captured = await requestDisplayCapture()

      const container = screenStreamRef.current!
      // Clear anything left from a previous share before reusing the container.
      container.getTracks().forEach((track) => {
        track.stop()
        container.removeTrack(track)
      })

      const videoTrack = captured.getVideoTracks()[0] ?? null
      const audioTrack = captured.getAudioTracks()[0] ?? null

      // A whole monitor is usually being navigated around, so favour smooth
      // motion; a single window or tab is usually text, so favour clarity.
      const surface = surfaceOf(videoTrack)
      if (videoTrack) {
        videoTrack.contentHint = contentHintFor(surface)
        container.addTrack(videoTrack)
      }
      if (audioTrack) container.addTrack(audioTrack)
      setScreenSurface(surface)

      isSharingRef.current = true

      peerConnsRef.current.forEach((conn) => {
        conn.screenSenders.forEach((sender) => {
          try {
            conn.pc.removeTrack(sender)
          } catch {
            /* ignore */
          }
        })
        conn.screenSenders = container.getTracks().map((track) => conn.pc.addTrack(track, container))

        const videoSender = conn.screenSenders.find((sender) => sender.track?.kind === 'video')
        if (videoSender) void applyScreenEncoding(videoSender, peerConnsRef.current.size)
      })

      setLocalScreenStream(new MediaStream(container.getTracks()))
      setIsScreenSharing(true)
      socket.emit('screen-share', { isSharing: true, streamId: container.id })

      // Fires when the user stops sharing from the browser's own control.
      videoTrack?.addEventListener('ended', () => stopScreenShare())

      // The user can swap surfaces mid-share; keep the label honest and
      // re-tune the encoder hint for whatever they switched to.
      if (videoTrack) {
        onSurfaceChange(videoTrack, (next) => {
          setScreenSurface(next)
          videoTrack.contentHint = contentHintFor(next)
        })
      }
    } catch (err) {
      const name = (err as DOMException)?.name
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        console.error('[WebRTC] screen share failed:', err)
        setScreenShareError('Could not start screen sharing.')
      }
    }
  }, [socket, stopScreenShare])

  // ── Chat, hand, host actions ─────────────────────────────────────────────
  const sendMessage = useCallback(
    (message: string) => socket.emit('send-message', { message }),
    [socket]
  )

  const toggleHand = useCallback(() => {
    setIsHandRaised((prev) => {
      const next = !prev
      socket.emit('raise-hand', { isRaised: next })
      return next
    })
  }, [socket])

  const kickParticipant = useCallback(
    (targetSocketId: string) => socket.emit('host:kick', { targetSocketId }),
    [socket]
  )
  const muteParticipant = useCallback(
    (targetSocketId: string) => socket.emit('host:mute', { targetSocketId }),
    [socket]
  )
  const muteEveryone = useCallback(() => socket.emit('host:mute-all'), [socket])
  const makeHost = useCallback(
    (targetSocketId: string) => socket.emit('host:transfer', { targetSocketId }),
    [socket]
  )
  const setLocked = useCallback((locked: boolean) => socket.emit('host:lock', { locked }), [socket])

  const isOwner = useMemo(() => !!ownerId && !!selfId && ownerId === selfId, [ownerId, selfId])

  return {
    localStream,
    localScreenStream,
    peers,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    screenSurface,
    isHandRaised,
    messages,
    transcript,
    missedTranscript,
    meetingStartedAt,
    isOwner,
    ownerId,
    isLocked,
    maxParticipants,
    wasKicked,
    isConnected,
    signalingStatus,
    hasTurn,
    relayWarning,
    hadIceFailure,
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
  }
}
