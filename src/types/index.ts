// ─────────────────────────────────────────────────────────────────────────────
// Shared types for AuzMeet — used by both the client and (informally) server.js
// ─────────────────────────────────────────────────────────────────────────────

/** A participant as tracked by the signaling server. */
export interface UserInfo {
  socketId: string
  name: string
  roomId: string
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isHandRaised: boolean
  isScreenSharing: boolean
  isRecording: boolean
  isTranscribing: boolean
  /** Stream id this participant will present their screen on, if they do. */
  screenStreamId: string | null
  joinedAt: string
}

export type ConnectionQuality = 'connecting' | 'excellent' | 'good' | 'poor' | 'lost'

/**
 * A remote participant on the client.
 *
 * A peer's camera and screen arrive as two independent streams, told apart by
 * the stream id the peer announced, so both can be shown at the same time —
 * sharing your screen never takes your camera away.
 */
export interface PeerState {
  socketId: string
  name: string
  /** Microphone + camera. Always present; tracks go live once media flows. */
  cameraStream: MediaStream | null
  /** Screen video + optional screen audio. Only meaningful while isScreenSharing. */
  screenStream: MediaStream | null
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isHandRaised: boolean
  isScreenSharing: boolean
  isRecording: boolean
  isTranscribing: boolean
  quality: ConnectionQuality
  connectionState: RTCPeerConnectionState
}

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  message: string
  timestamp: string
  /** System notices (joins, leaves, recording started…) render differently. */
  system?: boolean
}

/** How the stage arranges tiles. 'auto' follows screen shares and speakers. */
export type LayoutMode = 'auto' | 'grid' | 'spotlight'

export type RecordingMode = 'meeting' | 'screen' | 'camera'

/** A finished recording held in memory as an object URL. */
export interface RecordingEntry {
  id: string
  name: string
  url: string
  size: number
  durationMs: number
  mimeType: string
  createdAt: string
  mode: RecordingMode
}

/**
 * One renderable participant surface. A participant who is sharing produces
 * two tiles: their camera and their screen.
 */
export interface Tile {
  /** Unique per surface: `${socketId}` or `${socketId}:screen`. */
  id: string
  socketId: string
  name: string
  stream: MediaStream | null
  kind: 'camera' | 'screen'
  isLocal: boolean
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isHandRaised: boolean
  isHost: boolean
  isRecording: boolean
  quality: ConnectionQuality
}

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
}

export interface DeviceOption {
  deviceId: string
  label: string
}

export interface MediaDeviceSets {
  cameras: DeviceOption[]
  microphones: DeviceOption[]
  speakers: DeviceOption[]
}

/** One finalised utterance from a participant. */
export interface TranscriptEntry {
  id: string
  speakerId: string
  speakerName: string
  text: string
  timestamp: string
}

/** Notes produced from a transcript, by an LLM or the local fallback. */
export interface MeetingNotes {
  summary: string
  keyPoints: string[]
  decisions: string[]
  actionItems: { text: string; owner?: string }[]
  /** Which model wrote them, or 'local' when generated without an LLM. */
  generatedBy: string
  generatedAt: string
}

/** Orientation for someone who joined late or stepped away. */
export interface CatchUpBrief {
  headline: string
  missed: string[]
  currentTopic: string
  openQuestions: string[]
  /** Anything addressed to this person by name while they were away. */
  mentionsOfYou: string[]
  /** How many transcript segments the brief was built from. */
  coveredEntries: number
  generatedBy: string
  generatedAt: string
}
