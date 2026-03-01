export interface UserInfo {
  socketId: string
  name: string
  roomId: string
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isHandRaised: boolean
}

export interface PeerState {
  socketId: string
  name: string
  stream: MediaStream | null
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isHandRaised: boolean
}

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  message: string
  timestamp: string
}
