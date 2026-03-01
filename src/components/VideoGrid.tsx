'use client'

import { PeerState } from '@/types'
import { VideoTile } from './VideoTile'

interface VideoGridProps {
  localStream: MediaStream | null
  localName: string
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  peers: Map<string, PeerState>
}

function getGridClass(count: number): string {
  if (count === 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-2'
  if (count <= 4) return 'grid-cols-2'
  if (count <= 6) return 'grid-cols-3'
  if (count <= 9) return 'grid-cols-3'
  return 'grid-cols-4'
}

export function VideoGrid({
  localStream,
  localName,
  isAudioEnabled,
  isVideoEnabled,
  peers,
}: VideoGridProps) {
  const peerArray = Array.from(peers.values())
  const total = peerArray.length + 1 // +1 for local user
  const gridClass = getGridClass(total)

  return (
    <div className={`grid ${gridClass} gap-1 w-full h-full p-1 auto-rows-fr`}>
      {/* Local video always first */}
      <VideoTile
        stream={localStream}
        name={localName}
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        isLocal
        className="w-full h-full"
      />

      {/* Remote participants */}
      {peerArray.map((peer) => (
        <VideoTile
          key={peer.socketId}
          stream={peer.stream}
          name={peer.name}
          isAudioEnabled={peer.isAudioEnabled}
          isVideoEnabled={peer.isVideoEnabled}
          isHandRaised={peer.isHandRaised}
          className="w-full h-full"
        />
      ))}
    </div>
  )
}
