'use client'

import { useState, useEffect } from 'react'
import { Minimize2, Maximize2, Expand, Shrink } from 'lucide-react'
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
  if (count <= 9) return 'grid-cols-2 sm:grid-cols-3'
  return 'grid-cols-2 sm:grid-cols-4'
}

export function VideoGrid({
  localStream,
  localName,
  isAudioEnabled,
  isVideoEnabled,
  peers,
  screenSharingSocketId,
}: VideoGridProps) {
  // isExpanded: show the screen share in the featured layout (vs collapsed grid view)
  const [isExpanded, setIsExpanded] = useState(true)
  // isPinned: on mobile, hide the filmstrip so the shared screen fills the area
  const [isPinned, setIsPinned] = useState(false)

  const isScreenSharing = screenSharingSocketId !== null
  const peerArray = Array.from(peers.values())

  // Auto-expand the featured view whenever a new screen share starts
  useEffect(() => {
    if (isScreenSharing) {
      setIsExpanded(true)
      setIsPinned(false)
    }
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
      // Mobile: column (main on top, filmstrip below)
      // Desktop: row (main left, filmstrip right)
      <div className="flex flex-col sm:flex-row w-full h-full gap-1 p-1">
        {/* ── Main screen share tile ── */}
        <div className="relative flex-1 min-w-0 min-h-0">
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

          {/* Collapse button — always visible */}
          <button
            onClick={() => setIsExpanded(false)}
            className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-black/50 hover:bg-black/75 active:bg-black/90 text-white text-xs font-medium rounded-lg px-3 py-2 transition-colors touch-manipulation"
            title="Collapse to grid view"
          >
            <Minimize2 size={13} />
            <span className="hidden xs:inline">Collapse</span>
          </button>

          {/* Pin / Unpin button — mobile only, hides/shows the filmstrip */}
          {filmTiles.length > 0 && (
            <button
              onClick={() => setIsPinned((p) => !p)}
              className="absolute top-2 left-2 z-10 sm:hidden flex items-center gap-1.5 bg-black/50 active:bg-black/90 text-white text-xs font-medium rounded-lg px-3 py-2 transition-colors touch-manipulation"
              title={isPinned ? 'Show participants' : 'Fullscreen'}
            >
              {isPinned ? <Shrink size={13} /> : <Expand size={13} />}
              {isPinned ? 'Show all' : 'Fullscreen'}
            </button>
          )}
        </div>

        {/* ── Participant filmstrip ── */}
        {/* Mobile: horizontal row at bottom (hidden when pinned) */}
        {/* Desktop: vertical column on the right */}
        {filmTiles.length > 0 && !isPinned && (
          <div className="flex sm:flex-col flex-row gap-1 h-24 sm:h-auto w-full sm:w-44 shrink-0 overflow-x-auto sm:overflow-x-hidden sm:overflow-y-auto">
            {filmTiles.map((tile) => (
              <div
                key={tile.id}
                className="h-full aspect-video shrink-0 sm:w-full sm:h-auto sm:aspect-video"
              >
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
          className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-black/50 hover:bg-black/75 active:bg-black/90 text-white text-xs font-medium rounded-lg px-3 py-2 transition-colors touch-manipulation"
          title="Expand screen share"
        >
          <Maximize2 size={13} />
          Expand screen
        </button>
      )}
    </div>
  )
}
