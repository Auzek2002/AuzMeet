/**
 * Socket.IO signaling for AuzMeet.
 *
 * Kept free of any Next.js coupling so the exact same logic can run two ways:
 *   - server.js          — Next.js + signaling in one process (local dev)
 *   - signaling-server.js — signaling only (deployed on its own)
 *
 * This must run as ONE long-lived process. Room membership lives in the Maps
 * below, and WebSockets are held open for the length of a call, so it cannot
 * be hosted on short-lived serverless functions (Vercel, Netlify Functions,
 * Lambda). See DEPLOYMENT.md.
 */

const MAX_PARTICIPANTS = parseInt(process.env.MAX_PARTICIPANTS || '16', 10)

function attachSignaling(io) {
  /** rooms: Map<roomId, { members: Set<socketId>, ownerId, locked, createdAt }> */
  const rooms = new Map()
  /** users: Map<socketId, UserInfo> */
  const users = new Map()

  const publicUser = (u) => ({
    socketId: u.socketId,
    name: u.name,
    roomId: u.roomId,
    isAudioEnabled: u.isAudioEnabled,
    isVideoEnabled: u.isVideoEnabled,
    isHandRaised: u.isHandRaised,
    isScreenSharing: u.isScreenSharing,
    isRecording: u.isRecording,
    isTranscribing: u.isTranscribing,
    // Lets peers tell a presented screen apart from a camera as soon as its
    // tracks arrive, however long before or after the share begins.
    screenStreamId: u.screenStreamId,
    joinedAt: u.joinedAt,
  })

  const systemMessage = (roomId, text) => {
    io.to(roomId).emit('receive-message', {
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderId: 'system',
      senderName: 'AuzMeet',
      message: text,
      timestamp: new Date().toISOString(),
      system: true,
    })
  }

  /** Host-only guard. Returns the caller's room, or null when not authorized. */
  const requireHost = (socketId) => {
    const user = users.get(socketId)
    if (!user) return null
    const room = rooms.get(user.roomId)
    if (!room || room.ownerId !== socketId) return null
    return { room, roomId: user.roomId }
  }

  /** Removes a member from a room and tells everyone. Returns true if removed. */
  const removeMember = (socketId, { silent = false } = {}) => {
    const user = users.get(socketId)
    if (!user) return false
    const roomId = user.roomId
    const room = rooms.get(roomId)

    users.delete(socketId)

    if (room) {
      room.members.delete(socketId)

      if (room.members.size === 0) {
        rooms.delete(roomId)
        console.log(`[Room ${roomId}] empty - removed`)
      } else if (room.ownerId === socketId) {
        room.ownerId = room.members.values().next().value
        const newHost = users.get(room.ownerId)
        io.to(roomId).emit('owner-changed', { ownerId: room.ownerId })
        if (newHost) systemMessage(roomId, `${newHost.name} is now the host`)
        console.log(`[Room ${roomId}] host transferred to ${room.ownerId}`)
      }
    }

    io.to(roomId).emit('user-left', { socketId })
    if (!silent) systemMessage(roomId, `${user.name} left the meeting`)
    return true
  }

  io.on('connection', (socket) => {
    console.log(`[Socket] connected: ${socket.id}`)

    // -- Join ---------------------------------------------------------------
    socket.on('join-room', ({ roomId, userName, mediaState, screenStreamId }) => {
      if (typeof roomId !== 'string' || !roomId.trim()) {
        socket.emit('join-error', { reason: 'invalid-room' })
        return
      }

      // Re-join after a reconnect: drop any stale record for this socket first.
      if (users.has(socket.id)) removeMember(socket.id, { silent: true })

      const existingRoom = rooms.get(roomId)

      if (existingRoom && existingRoom.members.size >= MAX_PARTICIPANTS) {
        socket.emit('join-error', { reason: 'room-full', max: MAX_PARTICIPANTS })
        return
      }
      if (existingRoom && existingRoom.locked) {
        socket.emit('join-error', { reason: 'room-locked' })
        return
      }

      const trimmedName =
        typeof userName === 'string' && userName.trim() ? userName.trim().slice(0, 50) : ''

      const user = {
        socketId: socket.id,
        name: trimmedName || `Guest ${socket.id.slice(0, 4)}`,
        roomId,
        isAudioEnabled:
          mediaState && typeof mediaState.audio === 'boolean' ? mediaState.audio : true,
        isVideoEnabled:
          mediaState && typeof mediaState.video === 'boolean' ? mediaState.video : true,
        isHandRaised: false,
        isScreenSharing: false,
        isRecording: false,
        isTranscribing: false,
        screenStreamId: typeof screenStreamId === 'string' ? screenStreamId : null,
        joinedAt: new Date().toISOString(),
      }

      users.set(socket.id, user)
      socket.join(roomId)

      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          members: new Set(),
          ownerId: socket.id,
          locked: false,
          createdAt: Date.now(),
        })
      }
      const room = rooms.get(roomId)

      // Snapshot the room as it was BEFORE this socket joined, so the newcomer
      // knows exactly who to open a peer connection with.
      const existingUsers = Array.from(room.members)
        .map((id) => users.get(id))
        .filter(Boolean)
        .map(publicUser)

      socket.emit('room-users', {
        users: existingUsers,
        ownerId: room.ownerId,
        locked: room.locked,
        maxParticipants: MAX_PARTICIPANTS,
        selfId: socket.id,
      })

      room.members.add(socket.id)
      socket.to(roomId).emit('user-joined', publicUser(user))
      systemMessage(roomId, `${user.name} joined the meeting`)

      console.log(
        `[Room ${roomId}] "${user.name}" joined - ${room.members.size}/${MAX_PARTICIPANTS}`
      )
    })

    // -- Perfect-negotiation signaling --------------------------------------
    // One channel for both descriptions and candidates keeps ordering intact.
    socket.on('signal', ({ target, description, candidate }) => {
      const user = users.get(socket.id)
      if (!user || !target) return
      const targetUser = users.get(target)
      if (!targetUser || targetUser.roomId !== user.roomId) return

      io.to(target).emit('signal', {
        from: socket.id,
        fromUser: publicUser(user),
        description,
        candidate,
      })
    })

    // -- Media state --------------------------------------------------------
    socket.on('media-state', ({ audio, video }) => {
      const user = users.get(socket.id)
      if (!user) return
      if (typeof audio === 'boolean') user.isAudioEnabled = audio
      if (typeof video === 'boolean') user.isVideoEnabled = video
      socket.to(user.roomId).emit('user-media-state', {
        socketId: socket.id,
        audio: user.isAudioEnabled,
        video: user.isVideoEnabled,
      })
    })

    socket.on('raise-hand', ({ isRaised }) => {
      const user = users.get(socket.id)
      if (!user) return
      user.isHandRaised = !!isRaised
      socket.to(user.roomId).emit('user-hand-raised', {
        socketId: socket.id,
        isRaised: user.isHandRaised,
      })
    })

    socket.on('screen-share', ({ isSharing, streamId }) => {
      const user = users.get(socket.id)
      if (!user) return
      user.isScreenSharing = !!isSharing
      if (typeof streamId === 'string') user.screenStreamId = streamId
      socket.to(user.roomId).emit('user-screen-share', {
        socketId: socket.id,
        isSharing: user.isScreenSharing,
        streamId: user.screenStreamId,
      })
    })

    // Everyone in the room is told when a recording starts or stops - the
    // participants being recorded should always know about it.
    socket.on('recording-state', ({ isRecording }) => {
      const user = users.get(socket.id)
      if (!user) return
      const next = !!isRecording
      const changed = user.isRecording !== next
      user.isRecording = next
      socket.to(user.roomId).emit('user-recording', {
        socketId: socket.id,
        isRecording: next,
      })
      if (changed) {
        systemMessage(
          user.roomId,
          next
            ? `${user.name} started recording this meeting`
            : `${user.name} stopped recording`
        )
      }
    })

    // -- Live transcription -------------------------------------------------
    // Each client transcribes its own microphone and sends finished lines here;
    // the server only attributes and fans them out.
    socket.on('transcript', ({ text }) => {
      const user = users.get(socket.id)
      if (!user || typeof text !== 'string') return
      const clean = text.trim().slice(0, 1000)
      if (!clean) return

      io.to(user.roomId).emit('transcript', {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        speakerId: socket.id,
        speakerName: user.name,
        text: clean,
        timestamp: new Date().toISOString(),
      })
    })

    // Everyone is told when someone turns note-taking on, the same way
    // recording is announced - speech is sent to a transcription service.
    socket.on('transcription-state', ({ isTranscribing }) => {
      const user = users.get(socket.id)
      if (!user) return
      const next = !!isTranscribing
      const changed = user.isTranscribing !== next
      user.isTranscribing = next
      socket.to(user.roomId).emit('user-transcribing', {
        socketId: socket.id,
        isTranscribing: next,
      })
      if (changed) {
        systemMessage(
          user.roomId,
          next
            ? `${user.name} turned on live notes`
            : `${user.name} turned off live notes`
        )
      }
    })

    // -- Chat ---------------------------------------------------------------
    socket.on('send-message', ({ message }) => {
      const user = users.get(socket.id)
      if (!user || typeof message !== 'string') return
      const text = message.trim().slice(0, 2000)
      if (!text) return

      io.to(user.roomId).emit('receive-message', {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        senderId: socket.id,
        senderName: user.name,
        message: text,
        timestamp: new Date().toISOString(),
      })
    })

    // -- Host controls ------------------------------------------------------
    socket.on('host:kick', ({ targetSocketId }) => {
      const ctx = requireHost(socket.id)
      if (!ctx || !ctx.room.members.has(targetSocketId)) return

      const target = users.get(targetSocketId)
      io.to(targetSocketId).emit('kicked')
      removeMember(targetSocketId, { silent: true })
      if (target) systemMessage(ctx.roomId, `${target.name} was removed by the host`)

      const targetSocket = io.sockets.sockets.get(targetSocketId)
      if (targetSocket) targetSocket.leave(ctx.roomId)
    })

    // The host cannot reach into a participant's microphone - it asks their
    // client to mute itself, which then broadcasts the new state as usual.
    socket.on('host:mute', ({ targetSocketId }) => {
      const ctx = requireHost(socket.id)
      if (!ctx || !ctx.room.members.has(targetSocketId)) return
      const by = users.get(socket.id)
      io.to(targetSocketId).emit('force-mute', { by: by ? by.name : 'The host' })
    })

    socket.on('host:mute-all', () => {
      const ctx = requireHost(socket.id)
      if (!ctx) return
      const host = users.get(socket.id)
      const by = host ? host.name : 'The host'
      ctx.room.members.forEach((id) => {
        if (id !== socket.id) io.to(id).emit('force-mute', { by })
      })
      systemMessage(ctx.roomId, `${by} muted everyone`)
    })

    socket.on('host:transfer', ({ targetSocketId }) => {
      const ctx = requireHost(socket.id)
      if (!ctx || !ctx.room.members.has(targetSocketId)) return
      ctx.room.ownerId = targetSocketId
      io.to(ctx.roomId).emit('owner-changed', { ownerId: targetSocketId })
      const target = users.get(targetSocketId)
      if (target) systemMessage(ctx.roomId, `${target.name} is now the host`)
    })

    socket.on('host:lock', ({ locked }) => {
      const ctx = requireHost(socket.id)
      if (!ctx) return
      ctx.room.locked = !!locked
      io.to(ctx.roomId).emit('room-lock-state', { locked: ctx.room.locked })
      systemMessage(
        ctx.roomId,
        ctx.room.locked ? 'The host locked the meeting' : 'The host unlocked the meeting'
      )
    })

    // -- Leave / disconnect -------------------------------------------------
    socket.on('leave-room', () => {
      const user = users.get(socket.id)
      if (!user) return
      const roomId = user.roomId
      removeMember(socket.id)
      socket.leave(roomId)
    })

    socket.on('disconnect', (reason) => {
      const user = users.get(socket.id)
      if (user) {
        const name = user.name
        removeMember(socket.id)
        console.log(`[Socket] disconnected: ${socket.id} ("${name}") - ${reason}`)
      }
    })
  })

  return { rooms, users }
}

module.exports = { attachSignaling, MAX_PARTICIPANTS }
