'use client'

import { useState, useEffect } from 'react'
import { Minimize2, Maximize2 } from 'lucide-react'
import { PeerState } from '@/types'
import { VideoTile } from './VideoTile'

interface VideoGridProps {
  localStream: MediaStream | null
  localName: string
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  peers: Map<string, PeerState>
  screenSharingSocketId: string | null // 'local' | peer socketId | null
}

function getGridClass(count: number): string {
  if (count === 1) return 'grid-cols-1'
  if (count <= 4) return 'grid-cols-2'
  if (count <= 9) return 'grid-cols-3'
  return 'grid-cols-4'
}

export function VideoGrid({
  localStream,
  localName,
  isAudioEnabled,
  isVideoEnabled,
  peers,
  screenSharingSocketId,
}: VideoGridProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const isScreenSharing = screenSharingSocketId !== null
  const peerArray = Array.from(peers.values())

  // Auto-expand the featured view whenever a new screen share starts
  useEffect(() => {
    if (isScreenSharing) setIsExpanded(true)
  }, [isScreenSharing])

  // ── Screen share layout ──────────────────────────────────────────────────
  if (isScreenSharing && isExpanded) {
    const isLocalSharing = screenSharingSocketId === 'local'
    const sharingPeer = isLocalSharing ? null : peers.get(screenSharingSocketId!)

    const mainStream = isLocalSharing ? localStream : (sharingPeer?.stream ?? null)
    const mainName = isLocalSharing ? localName : (sharingPeer?.name ?? '')
    const mainAudio = isLocalSharing ? isAudioEnabled : (sharingPeer?.isAudioEnabled ?? true)
    const mainHand = isLocalSharing ? false : (sharingPeer?.isHandRaised ?? false)

    // Filmstrip: everyone except the sharer
    type FilmTile = {
      id: string
      stream: MediaStream | null
      name: string
      isAudioEnabled: boolean
      isVideoEnabled: boolean
      isHandRaised: boolean
      isLocal: boolean
    }

    const filmTiles: FilmTile[] = []

    if (!isLocalSharing) {
      // Local user goes first in the strip
      filmTiles.push({
        id: 'local',
        stream: localStream,
        name: localName,
        isAudioEnabled,
        isVideoEnabled,
        isHandRaised: false,
        isLocal: true,
      })
    }

    peerArray
      .filter((p) => p.socketId !== screenSharingSocketId)
      .forEach((p) =>
        filmTiles.push({
          id: p.socketId,
          stream: p.stream,
          name: p.name,
          isAudioEnabled: p.isAudioEnabled,
          isVideoEnabled: p.isVideoEnabled,
          isHandRaised: p.isHandRaised,
          isLocal: false,
        })
      )

    return (
      <div className="flex w-full h-full gap-1 p-1">
        {/* ── Main screen share tile ── */}
        <div className="relative flex-1 min-w-0">
          <VideoTile
            stream={mainStream}
            name={mainName}
            isAudioEnabled={mainAudio}
            isVideoEnabled={true}
            isHandRaised={mainHand}
            isLocal={isLocalSharing}
            mirror={false}
            contain={true}
            className="w-full h-full"
          />
          {/* Collapse button */}
          <button
            onClick={() => setIsExpanded(false)}
            className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-black/50 hover:bg-black/75 text-white text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors"
            title="Collapse to grid view"
          >
            <Minimize2 size={13} />
            Collapse
          </button>
        </div>

        {/* ── Participant filmstrip ── */}
        {filmTiles.length > 0 && (
          <div className="flex flex-col gap-1 w-44 shrink-0 overflow-y-auto">
            {filmTiles.map((tile) => (
              <div key={tile.id} className="w-full aspect-video shrink-0">
                <VideoTile
                  stream={tile.stream}
                  name={tile.name}
                  isAudioEnabled={tile.isAudioEnabled}
                  isVideoEnabled={tile.isVideoEnabled}
                  isHandRaised={tile.isHandRaised}
                  isLocal={tile.isLocal}
                  className="w-full h-full"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Normal grid layout ───────────────────────────────────────────────────
  const total = peerArray.length + 1
  const gridClass = getGridClass(total)

  return (
    <div className="relative w-full h-full">
      <div className={`grid ${gridClass} gap-1 w-full h-full p-1 auto-rows-fr`}>
        <VideoTile
          stream={localStream}
          name={localName}
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
          isLocal
          className="w-full h-full"
        />
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

      {/* Re-expand button when screen share is active but grid view is shown */}
      {isScreenSharing && (
        <button
          onClick={() => setIsExpanded(true)}
          className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-black/50 hover:bg-black/75 text-white text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors"
          title="Expand screen share"
        >
          <Maximize2 size={13} />
          Expand screen
        </button>
      )}
    </div>
  )
}
