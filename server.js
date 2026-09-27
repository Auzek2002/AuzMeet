const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { Server } = require('socket.io')
const { attachSignaling, MAX_PARTICIPANTS } = require('./signaling')

const dev = process.env.NODE_ENV !== 'production'
// Bind on all interfaces by default: most hosts route traffic to the container
// address, not to loopback.
const hostname = process.env.HOST || '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      await handle(req, res, parse(req.url, true))
    } catch (err) {
      console.error('Error handling request:', req.url, err)
      res.statusCode = 500
      res.end('Internal server error')
    }
  })

  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    maxHttpBufferSize: 1e6,
  })

  attachSignaling(io)

  httpServer.listen(port, hostname, () => {
    console.log(`\n> AuzMeet ready on http://localhost:${port}`)
    console.log(`> Signaling + app in one process`)
    console.log(`> Up to ${MAX_PARTICIPANTS} participants per meeting\n`)
  })
}).catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
