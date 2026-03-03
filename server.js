const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { Server } = require('socket.io')

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error handling request:', req.url, err)
      res.statusCode = 500
      res.end('Internal server error')
    }
  })

  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  })

  // In-memory state
  // rooms: Map<roomId, { members: Set<socketId>, ownerId: string }>
  // users: Map<socketId, UserInfo>
  const rooms = new Map()
  const users = new Map()

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`)

    // ── join-room ──────────────────────────────────────────────────────────
    socket.on('join-room', ({ roomId, userName }) => {
      const user = {
        socketId: socket.id,
        name: userName || `Guest ${socket.id.slice(0, 4)}`,
        roomId,
        isAudioEnabled: true,
        isVideoEnabled: true,
        isHandRaised: false,
        isScreenSharing: false,
      }

      users.set(socket.id, user)
      socket.join(roomId)

      if (!rooms.has(roomId)) {
        rooms.set(roomId, { members: new Set(), ownerId: socket.id })
      }

      const room = rooms.get(roomId)

      // Snapshot of existing users BEFORE adding this one
      const existingUsers = Array.from(room.members)
        .map((id) => users.get(id))
        .filter(Boolean)

      // Tell the new joiner who is already in the room + who the owner is
      socket.emit('room-users', { users: existingUsers, ownerId: room.ownerId })

      // Add to room
      room.members.add(socket.id)

      // Notify everyone else
      socket.to(roomId).emit('user-joined', user)

      console.log(`[Room ${roomId}] "${user.name}" joined. Size: ${room.size}`)
    })

    // ── WebRTC signaling ───────────────────────────────────────────────────
    socket.on('offer', ({ target, sdp }) => {
      const user = users.get(socket.id)
      if (user) {
        io.to(target).emit('offer', { sdp, from: socket.id, fromUser: user })
      }
    })

    socket.on('answer', ({ target, sdp }) => {
      io.to(target).emit('answer', { sdp, from: socket.id })
    })

    socket.on('ice-candidate', ({ target, candidate }) => {
      io.to(target).emit('ice-candidate', { candidate, from: socket.id })
    })

    // ── Media state broadcasts ─────────────────────────────────────────────
    socket.on('toggle-audio', ({ isEnabled }) => {
      const user = users.get(socket.id)
      if (user) {
        user.isAudioEnabled = isEnabled
        socket.to(user.roomId).emit('user-audio-toggle', {
          socketId: socket.id,
          isEnabled,
        })
      }
    })

    socket.on('toggle-video', ({ isEnabled }) => {
      const user = users.get(socket.id)
      if (user) {
        user.isVideoEnabled = isEnabled
        socket.to(user.roomId).emit('user-video-toggle', {
          socketId: socket.id,
          isEnabled,
        })
      }
    })

    socket.on('raise-hand', ({ isRaised }) => {
      const user = users.get(socket.id)
      if (user) {
        user.isHandRaised = isRaised
        socket.to(user.roomId).emit('user-hand-raised', {
          socketId: socket.id,
          isRaised,
        })
      }
    })

    socket.on('screen-share-toggle', ({ isSharing }) => {
      const user = users.get(socket.id)
      if (user) {
        user.isScreenSharing = isSharing
        socket.to(user.roomId).emit('user-screen-share-toggle', {
          socketId: socket.id,
          isSharing,
        })
      }
    })

    // ── Kick participant ───────────────────────────────────────────────────
    socket.on('kick-participant', ({ targetSocketId }) => {
      const requester = users.get(socket.id)
      if (!requester) return
      const room = rooms.get(requester.roomId)
      if (!room || room.ownerId !== socket.id) return // only owner can kick
      if (!room.members.has(targetSocketId)) return

      // Notify the kicked user first so they can handle it before disconnect
      io.to(targetSocketId).emit('kicked')

      // Clean up server state
      room.members.delete(targetSocketId)
      users.delete(targetSocketId)

      // Tell everyone else they left
      socket.to(requester.roomId).emit('user-left', { socketId: targetSocketId })

      // Remove from Socket.io room
      const targetSocket = io.sockets.sockets.get(targetSocketId)
      if (targetSocket) targetSocket.leave(requester.roomId)
    })

    // ── Chat ───────────────────────────────────────────────────────────────
    socket.on('send-message', ({ message }) => {
      const user = users.get(socket.id)
      if (user) {
        const chatMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          senderId: socket.id,
          senderName: user.name,
          message,
          timestamp: new Date().toISOString(),
        }
        io.to(user.roomId).emit('receive-message', chatMessage)
      }
    })

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const user = users.get(socket.id)
      if (user) {
        const room = rooms.get(user.roomId)
        if (room) {
          room.members.delete(socket.id)
          if (room.members.size === 0) {
            rooms.delete(user.roomId)
            console.log(`[Room ${user.roomId}] Empty — removed`)
          } else if (room.ownerId === socket.id) {
            // Transfer ownership to the next member in the room
            room.ownerId = room.members.values().next().value
            io.to(user.roomId).emit('owner-changed', { ownerId: room.ownerId })
            console.log(`[Room ${user.roomId}] Ownership transferred to ${room.ownerId}`)
          }
        }
        socket.to(user.roomId).emit('user-left', { socketId: socket.id })
        users.delete(socket.id)
        console.log(`[Socket] Disconnected: ${socket.id} ("${user.name}")`)
      }
    })
  })

  httpServer.listen(port, () => {
    console.log(`\n> AuzMeet ready on http://${hostname}:${port}\n`)
  })
}).catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
