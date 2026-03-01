'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Socket } from 'socket.io-client'
import { UserInfo, PeerState, ChatMessage } from '@/types'

// Build ICE server list with STUN + TURN.
// TURN credentials can be injected via environment variables (recommended for production).
// Falls back to OpenRelay public TURN servers for zero-config testing.
const TURN_URL = process.env.NEXT_PUBLIC_TURN_URL
const TURN_USERNAME = process.env.NEXT_PUBLIC_TURN_USERNAME
const TURN_CREDENTIAL = process.env.NEXT_PUBLIC_TURN_CREDENTIAL

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    // STUN — discovers public IP
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },

    // TURN — relays media when direct P2P fails (essential for cross-network calls)
    ...(TURN_URL && TURN_USERNAME && TURN_CREDENTIAL
      ? [
          // Custom TURN from env vars (Metered.ca, Twilio, etc.)
          { urls: TURN_URL, username: TURN_USERNAME, credential: TURN_CREDENTIAL },
          { urls: TURN_URL.replace(':80', ':443'), username: TURN_USERNAME, credential: TURN_CREDENTIAL },
          { urls: TURN_URL.replace('turn:', 'turns:').replace(':80', ':443'), username: TURN_USERNAME, credential: TURN_CREDENTIAL },
        ]
      : [
          // OpenRelay free public TURN — good for testing, no sign-up needed
          { urls: 'turn:openrelay.metered.ca:80',   username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443',  username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:80?transport=tcp',  username: 'openrelayproject', credential: 'openrelayproject' },
        ]),
  ],
  iceCandidatePoolSize: 10,
}

interface UseWebRTCProps {
  roomId: string
  socket: Socket
  userName: string
  initialStream: MediaStream | null
}

interface UseWebRTCReturn {
  localStream: MediaStream | null
  peers: Map<string, PeerState>
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isScreenSharing: boolean
  messages: ChatMessage[]
  isHandRaised: boolean
  toggleAudio: () => void
  toggleVideo: () => void
  startScreenShare: () => Promise<void>
  stopScreenShare: () => Promise<void>
  sendMessage: (message: string) => void
  toggleHand: () => void
}

export function useWebRTC({
  roomId,
  socket,
  userName,
  initialStream,
}: UseWebRTCProps): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(initialStream)
  const [peers, setPeers] = useState<Map<string, PeerState>>(new Map())
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isHandRaised, setIsHandRaised] = useState(false)

  const localStreamRef = useRef<MediaStream | null>(initialStream)
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const screenStreamRef = useRef<MediaStream | null>(null)
  const originalCameraTrackRef = useRef<MediaStreamTrack | null>(
    initialStream?.getVideoTracks()[0] ?? null
  )

  // ── Peer connection factory ──────────────────────────────────────────────
  const createPeerConnection = useCallback(
    (socketId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection(ICE_SERVERS)

      // Add local tracks to the connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!)
        })
      }

      // Receive remote stream
      const remoteStream = new MediaStream()
      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
          remoteStream.addTrack(track)
        })
        setPeers((prev) => {
          const updated = new Map(prev)
          const existing = updated.get(socketId)
          if (existing) {
            updated.set(socketId, { ...existing, stream: remoteStream })
          }
          return updated
        })
      }

      // Relay ICE candidates via signaling server
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', {
            target: socketId,
            candidate: event.candidate,
          })
        }
      }

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] ${socketId} → ${pc.connectionState}`)
      }

      peerConnectionsRef.current.set(socketId, pc)
      return pc
    },
    [socket]
  )

  // ── Add peer to state ────────────────────────────────────────────────────
  const addPeer = useCallback((user: UserInfo, stream: MediaStream | null = null) => {
    setPeers((prev) => {
      if (prev.has(user.socketId)) return prev
      const updated = new Map(prev)
      updated.set(user.socketId, {
        socketId: user.socketId,
        name: user.name,
        stream,
        isAudioEnabled: user.isAudioEnabled,
        isVideoEnabled: user.isVideoEnabled,
        isHandRaised: user.isHandRaised,
      })
      return updated
    })
  }, [])

  // ── Main socket effect ───────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !roomId) return

    // Set up all listeners BEFORE emitting join-room
    // so we don't miss events that arrive immediately after joining.

    // List of users already in the room when WE join
    socket.on('room-users', async (existingUsers: UserInfo[]) => {
      for (const user of existingUsers) {
        const pc = createPeerConnection(user.socketId)
        addPeer(user)
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          socket.emit('offer', { target: user.socketId, sdp: pc.localDescription })
        } catch (err) {
          console.error('[WebRTC] Error creating offer:', err)
        }
      }
    })

    // A NEW user joined (we are an existing participant)
    socket.on('user-joined', (user: UserInfo) => {
      // Just add them to state; they will send us an offer shortly
      if (!peerConnectionsRef.current.has(user.socketId)) {
        createPeerConnection(user.socketId)
        addPeer(user)
      }
    })

    // Receive an offer → send answer
    socket.on(
      'offer',
      async ({
        sdp,
        from,
        fromUser,
      }: {
        sdp: RTCSessionDescriptionInit
        from: string
        fromUser: UserInfo
      }) => {
        let pc = peerConnectionsRef.current.get(from)
        if (!pc) {
          pc = createPeerConnection(from)
          addPeer(fromUser)
        }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit('answer', { target: from, sdp: pc.localDescription })
        } catch (err) {
          console.error('[WebRTC] Error handling offer:', err)
        }
      }
    )

    // Receive answer → set remote description
    socket.on(
      'answer',
      async ({ sdp, from }: { sdp: RTCSessionDescriptionInit; from: string }) => {
        const pc = peerConnectionsRef.current.get(from)
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp))
          } catch (err) {
            console.error('[WebRTC] Error handling answer:', err)
          }
        }
      }
    )

    // ICE candidates
    socket.on(
      'ice-candidate',
      async ({ candidate, from }: { candidate: RTCIceCandidateInit; from: string }) => {
        const pc = peerConnectionsRef.current.get(from)
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (err) {
            console.error('[WebRTC] Error adding ICE candidate:', err)
          }
        }
      }
    )

    // Peer left
    socket.on('user-left', ({ socketId }: { socketId: string }) => {
      const pc = peerConnectionsRef.current.get(socketId)
      if (pc) {
        pc.close()
        peerConnectionsRef.current.delete(socketId)
      }
      setPeers((prev) => {
        const updated = new Map(prev)
        updated.delete(socketId)
        return updated
      })
    })

    // Remote media state changes
    socket.on(
      'user-audio-toggle',
      ({ socketId, isEnabled }: { socketId: string; isEnabled: boolean }) => {
        setPeers((prev) => {
          const updated = new Map(prev)
          const peer = updated.get(socketId)
          if (peer) updated.set(socketId, { ...peer, isAudioEnabled: isEnabled })
          return updated
        })
      }
    )

    socket.on(
      'user-video-toggle',
      ({ socketId, isEnabled }: { socketId: string; isEnabled: boolean }) => {
        setPeers((prev) => {
          const updated = new Map(prev)
          const peer = updated.get(socketId)
          if (peer) updated.set(socketId, { ...peer, isVideoEnabled: isEnabled })
          return updated
        })
      }
    )

    socket.on(
      'user-hand-raised',
      ({ socketId, isRaised }: { socketId: string; isRaised: boolean }) => {
        setPeers((prev) => {
          const updated = new Map(prev)
          const peer = updated.get(socketId)
          if (peer) updated.set(socketId, { ...peer, isHandRaised: isRaised })
          return updated
        })
      }
    )

    // Chat messages
    socket.on('receive-message', (message: ChatMessage) => {
      setMessages((prev) => [...prev, message])
    })

    // NOW emit join-room (after all listeners are registered)
    socket.emit('join-room', { roomId, userName })

    // Cleanup on unmount
    return () => {
      socket.off('room-users')
      socket.off('user-joined')
      socket.off('offer')
      socket.off('answer')
      socket.off('ice-candidate')
      socket.off('user-left')
      socket.off('user-audio-toggle')
      socket.off('user-video-toggle')
      socket.off('user-hand-raised')
      socket.off('receive-message')

      peerConnectionsRef.current.forEach((pc) => pc.close())
      peerConnectionsRef.current.clear()
    }
  }, [socket, roomId, userName, createPeerConnection, addPeer])

  // ── Audio toggle ─────────────────────────────────────────────────────────
  const toggleAudio = useCallback(() => {
    if (!localStreamRef.current) return
    const track = localStreamRef.current.getAudioTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      setIsAudioEnabled(track.enabled)
      socket.emit('toggle-audio', { isEnabled: track.enabled })
    }
  }, [socket])

  // ── Video toggle ─────────────────────────────────────────────────────────
  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current) return
    const track = localStreamRef.current.getVideoTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      setIsVideoEnabled(track.enabled)
      socket.emit('toggle-video', { isEnabled: track.enabled })
    }
  }, [socket])

  // ── Screen share ─────────────────────────────────────────────────────────
  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      })
      screenStreamRef.current = screenStream
      const screenVideoTrack = screenStream.getVideoTracks()[0]

      // Save the original camera track so we can restore it later
      if (localStreamRef.current) {
        const camTrack = localStreamRef.current.getVideoTracks()[0]
        if (camTrack) originalCameraTrackRef.current = camTrack
      }

      // Replace the video sender track in every peer connection
      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
        if (sender) sender.replaceTrack(screenVideoTrack)
      })

      // Update local preview stream
      if (localStreamRef.current) {
        const camTrack = localStreamRef.current.getVideoTracks()[0]
        if (camTrack) localStreamRef.current.removeTrack(camTrack)
        localStreamRef.current.addTrack(screenVideoTrack)
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
      }

      setIsScreenSharing(true)

      // Auto-stop when the user clicks "Stop sharing" in the browser UI
      screenVideoTrack.addEventListener('ended', () => {
        stopScreenShare()
      })
    } catch (err) {
      console.error('[WebRTC] Screen share error:', err)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stopScreenShare = useCallback(async () => {
    if (!screenStreamRef.current) return

    const screenVideoTrack = screenStreamRef.current.getVideoTracks()[0]
    screenStreamRef.current.getTracks().forEach((t) => t.stop())
    screenStreamRef.current = null

    // Restore original camera track
    const restoredTrack = originalCameraTrackRef.current
    if (restoredTrack) {
      // Re-enable the camera track
      restoredTrack.enabled = isVideoEnabled

      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
        if (sender) sender.replaceTrack(restoredTrack)
      })

      if (localStreamRef.current) {
        if (screenVideoTrack) localStreamRef.current.removeTrack(screenVideoTrack)
        if (!localStreamRef.current.getVideoTracks().includes(restoredTrack)) {
          localStreamRef.current.addTrack(restoredTrack)
        }
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
      }
    }

    setIsScreenSharing(false)
  }, [isVideoEnabled])

  // ── Chat ─────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    (message: string) => {
      socket.emit('send-message', { message })
    },
    [socket]
  )

  // ── Raise hand ───────────────────────────────────────────────────────────
  const toggleHand = useCallback(() => {
    setIsHandRaised((prev) => {
      const next = !prev
      socket.emit('raise-hand', { isRaised: next })
      return next
    })
  }, [socket])

  return {
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
  }
}
