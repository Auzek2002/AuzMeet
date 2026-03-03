import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (typeof window === 'undefined') {
    throw new Error('Socket.io client can only be used in the browser')
  }
  if (!socket) {
    // Connect to same origin (the custom server handles Socket.io on the same port)
    socket = io({
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })
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
