/**
 * Standalone AuzMeet signaling server.
 *
 * Run this on any host that keeps a process alive (Render, Railway, Fly.io,
 * a VPS, Docker) and point the web app at it with NEXT_PUBLIC_SIGNALING_URL.
 * The Next.js frontend can then stay on Vercel.
 *
 *   PORT              port to listen on (hosts usually inject this)
 *   ALLOWED_ORIGINS   comma-separated list of allowed web origins.
 *                     Defaults to "*", which is fine while you are testing but
 *                     should be set to your real domain in production.
 *   MAX_PARTICIPANTS  room capacity (default 16)
 */

const { createServer } = require('http')
const { Server } = require('socket.io')
const { attachSignaling, MAX_PARTICIPANTS } = require('./signaling')

const port = parseInt(process.env.PORT || '3001', 10)
const host = process.env.HOST || '0.0.0.0'

const allowed = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const corsOrigin = allowed.includes('*') ? '*' : allowed

const httpServer = createServer((req, res) => {
  // A plain health endpoint, so a platform health check (and you, in a browser)
  // can confirm the signaling server is actually up.
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(
      JSON.stringify({
        service: 'auzmeet-signaling',
        status: 'ok',
        maxParticipants: MAX_PARTICIPANTS,
        uptimeSeconds: Math.round(process.uptime()),
      })
    )
    return
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

const io = new Server(httpServer, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'], credentials: false },
  maxHttpBufferSize: 1e6,
  // Long-polling stays enabled as a fallback for networks that block WebSocket.
  transports: ['websocket', 'polling'],
})

attachSignaling(io)

httpServer.listen(port, host, () => {
  console.log(`\n> AuzMeet signaling server listening on ${host}:${port}`)
  console.log(`> Allowed origins: ${allowed.join(', ')}`)
  console.log(`> Up to ${MAX_PARTICIPANTS} participants per meeting`)
  console.log(`> Health check: /health\n`)
})

const shutdown = (signal) => {
  console.log(`\n${signal} received, closing signaling server…`)
  io.close(() => httpServer.close(() => process.exit(0)))
  // Do not hang forever if sockets refuse to drain.
  setTimeout(() => process.exit(0), 5000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
