'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Socket } from 'socket.io-client'
import { UserInfo, PeerState, ChatMessage } from '@/types'

// Default ICE config used until the server-side credentials are fetched
const STUN_ONLY: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

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
  isOwner: boolean
  ownerId: string | null
  wasKicked: boolean
  toggleAudio: () => void
  toggleVideo: () => void
  startScreenShare: () => Promise<void>
  stopScreenShare: () => Promise<void>
  sendMessage: (message: string) => void
  toggleHand: () => void
  kickParticipant: (socketId: string) => void
}

export function useWebRTC({
  roomId,
  socket,
  userName,
  initialStream,
}: UseWebRTCProps): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(initialStream)
  const [peers, setPeers] = useState<Map<string, PeerState>>(new Map())
  const [isAudioEnabled, setIsAudioEnabled] = useState(
    () => initialStream?.getAudioTracks()[0]?.enabled ?? true
  )
  const [isVideoEnabled, setIsVideoEnabled] = useState(
    () => initialStream?.getVideoTracks()[0]?.enabled ?? true
  )
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isHandRaised, setIsHandRaised] = useState(false)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [wasKicked, setWasKicked] = useState(false)

  const localStreamRef = useRef<MediaStream | null>(initialStream)
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const screenStreamRef = useRef<MediaStream | null>(null)
  const originalCameraTrackRef = useRef<MediaStreamTrack | null>(
    initialStream?.getVideoTracks()[0] ?? null
  )
  // Stores ICE servers fetched from our server-side API route
  const iceServersRef = useRef<RTCIceServer[]>(STUN_ONLY)

  // ── Peer connection factory ──────────────────────────────────────────────
  const createPeerConnection = useCallback(
    (socketId: string): RTCPeerConnection => {
      // Uses whatever ICE servers are currently in the ref (populated before joining)
      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        iceCandidatePoolSize: 10,
      })

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
        isScreenSharing: user.isScreenSharing ?? false,
      })
      return updated
    })
  }, [])

  // ── Main socket effect ───────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !roomId) return

    let cancelled = false
    let joined = false // tracks whether join-room has been emitted at least once

    // ── Reconnect handler ────────────────────────────────────────────────
    // Fires when the socket reconnects after the server restarted or the
    // connection dropped.  The server's in-memory room state is gone, so we
    // close all stale peer connections and re-join the room from scratch.
    const handleReconnect = () => {
      if (!joined) return // initial connect — join-room hasn't fired yet, ignore
      console.log('[Socket] Reconnected — clearing stale state and rejoining room')
      peerConnectionsRef.current.forEach((pc) => pc.close())
      peerConnectionsRef.current.clear()
      setPeers(new Map())
      socket.emit('join-room', { roomId, userName })
    }

    // 'connect' fires on both initial connection AND every reconnection.
    // Because the socket is already connected when this effect runs,
    // the NEXT 'connect' event is always a reconnection.
    socket.on('connect', handleReconnect)

    const initialize = async () => {
      // 1. Fetch TURN credentials from our server-side API route FIRST.
      //    The secret key is never exposed — it lives only in the server environment.
      try {
        const res = await fetch('/api/turn-credentials')
        const data = await res.json()
        if (!cancelled && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          iceServersRef.current = data.iceServers
          console.log(`[TURN] Loaded ${data.iceServers.length} ICE servers`)
        }
      } catch (err) {
        console.warn('[TURN] Could not fetch credentials, falling back to STUN only:', err)
      }

      if (cancelled) return

      // 2. Register all socket listeners BEFORE emitting join-room
      //    so we never miss an event that arrives immediately after joining.

      socket.on(
        'room-users',
        async ({ users: existingUsers, ownerId: roomOwnerId }: { users: UserInfo[]; ownerId: string }) => {
          setOwnerId(roomOwnerId)
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
        }
      )

      socket.on('user-joined', (user: UserInfo) => {
        const existing = peerConnectionsRef.current.get(user.socketId)
        const isStale =
          existing &&
          (existing.signalingState === 'closed' ||
            existing.connectionState === 'failed' ||
            existing.connectionState === 'closed')
        if (!existing || isStale) {
          if (existing) {
            existing.close()
            peerConnectionsRef.current.delete(user.socketId)
            setPeers((prev) => {
              const updated = new Map(prev)
              updated.delete(user.socketId)
              return updated
            })
          }
          createPeerConnection(user.socketId)
          addPeer(user)
        }
      })

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
          const isStale =
            pc &&
            (pc.signalingState === 'closed' ||
              pc.connectionState === 'failed' ||
              pc.connectionState === 'closed')
          if (!pc || isStale) {
            if (pc) {
              pc.close()
              peerConnectionsRef.current.delete(from)
              // Clear stale peer state so addPeer can re-add it with a fresh stream
              setPeers((prev) => {
                const updated = new Map(prev)
                updated.delete(from)
                return updated
              })
            }
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

      socket.on('receive-message', (message: ChatMessage) => {
        setMessages((prev) => [...prev, message])
      })

      socket.on('kicked', () => {
        setWasKicked(true)
      })

      socket.on('owner-changed', ({ ownerId: newOwnerId }: { ownerId: string }) => {
        setOwnerId(newOwnerId)
      })

      socket.on(
        'user-screen-share-toggle',
        ({ socketId, isSharing }: { socketId: string; isSharing: boolean }) => {
          setPeers((prev) => {
            const updated = new Map(prev)
            const peer = updated.get(socketId)
            if (peer) updated.set(socketId, { ...peer, isScreenSharing: isSharing })
            return updated
          })
        }
      )

      // 3. NOW join the room — ICE servers are ready, listeners are registered
      socket.emit('join-room', { roomId, userName })
      joined = true // reconnect handler is now active
    }

    initialize()

    return () => {
      cancelled = true
      socket.off('connect', handleReconnect)
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
      socket.off('kicked')
      socket.off('owner-changed')
      socket.off('user-screen-share-toggle')

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

      if (localStreamRef.current) {
        const camTrack = localStreamRef.current.getVideoTracks()[0]
        if (camTrack) originalCameraTrackRef.current = camTrack
      }

      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
        if (sender) sender.replaceTrack(screenVideoTrack)
      })

      if (localStreamRef.current) {
        const camTrack = localStreamRef.current.getVideoTracks()[0]
        if (camTrack) localStreamRef.current.removeTrack(camTrack)
        localStreamRef.current.addTrack(screenVideoTrack)
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
      }

      setIsScreenSharing(true)
      socket.emit('screen-share-toggle', { isSharing: true })

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

    const restoredTrack = originalCameraTrackRef.current
    if (restoredTrack) {
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
    socket.emit('screen-share-toggle', { isSharing: false })
  }, [isVideoEnabled, socket])

  // ── Chat ─────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    (message: string) => {
      socket.emit('send-message', { message })
    },
    [socket]
  )

  // ── Kick participant ─────────────────────────────────────────────────────
  const kickParticipant = useCallback(
    (targetSocketId: string) => {
      socket.emit('kick-participant', { targetSocketId })
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
    isOwner: ownerId === socket.id,
    ownerId,
    wasKicked,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    sendMessage,
    toggleHand,
    kickParticipant,
  }
}
