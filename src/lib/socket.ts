import { io, ManagerOptions, Socket, SocketOptions } from 'socket.io-client'

/**
 * Where the signaling server lives.
 *
 * Empty means "same origin", which is right when the app and the signaling
 * server run in one process (`npm run dev`, or a single container).
 *
 * Set NEXT_PUBLIC_SIGNALING_URL when they are deployed separately — for
 * example the frontend on Vercel and the signaling server on Render. Vercel
 * cannot host the signaling server itself: it needs a long-lived process
 * holding WebSockets, which serverless functions do not provide.
 */
export const SIGNALING_URL = (process.env.NEXT_PUBLIC_SIGNALING_URL || '').trim()

/** True when the app is served from a host that cannot run the signaling server. */
export function isServerlessHost(): boolean {
  if (typeof window === 'undefined') return false
  return /\.vercel\.app$|\.netlify\.app$/i.test(window.location.hostname)
}

let socket: Socket | null = null

export function getSocket(): Socket {
  if (typeof window === 'undefined') {
    throw new Error('Socket.io client can only be used in the browser')
  }

  if (!socket) {
    const options: Partial<ManagerOptions & SocketOptions> = {
      reconnection: true,
      // Keep trying for a good while: a brief network blip should recover on
      // its own rather than stranding someone mid-call.
      reconnectionAttempts: 12,
      reconnectionDelay: 800,
      reconnectionDelayMax: 6000,
      timeout: 12000,
      transports: ['websocket', 'polling'],
    }

    socket = SIGNALING_URL ? io(SIGNALING_URL, options) : io(options)
  } else if (socket.disconnected) {
    // After an explicit disconnect (Leave button), re-connect so the user
    // can join a new meeting without refreshing the page.
    socket.connect()
  }

  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
