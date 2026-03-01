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
  // rooms: Map<roomId, Set<socketId>>
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
      }

      users.set(socket.id, user)
      socket.join(roomId)

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set())
      }

      const room = rooms.get(roomId)

      // Snapshot of existing users BEFORE adding this one
      const existingUsers = Array.from(room)
        .map((id) => users.get(id))
        .filter(Boolean)

      // Tell the new joiner who is already in the room
      socket.emit('room-users', existingUsers)

      // Add to room
      room.add(socket.id)

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
          room.delete(socket.id)
          if (room.size === 0) {
            rooms.delete(user.roomId)
            console.log(`[Room ${user.roomId}] Empty — removed`)
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
