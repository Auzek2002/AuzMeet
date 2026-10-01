'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, MonitorUp } from 'lucide-react'
import { clsx } from 'clsx'
import { LayoutMode, Tile } from '@/types'
import { VideoTile } from './VideoTile'

interface MeetingStageProps {
  tiles: Tile[]
  layout: LayoutMode
  pinnedId: string | null
  onTogglePin: (id: string) => void
  speakingIds: Record<string, boolean>
  levels: Record<string, number>
  activeSpeakerId: string | null
  hideSelfView: boolean
}

/**
 * Picks the column count that gives the largest tiles closest to 16:9 for the
 * space actually available. Fixed breakpoints leave holes - three people in a
 * two-column grid wastes a whole quadrant - so this measures instead.
 */
function bestColumns(count: number, width: number, height: number): number {
  if (count <= 1) return 1
  if (!width || !height) return Math.ceil(Math.sqrt(count))

  const TARGET = 16 / 9
  let best = 1
  let bestScore = -Infinity

  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols)
    const tileWidth = width / cols
    const tileHeight = height / rows
    // Distance from the target aspect, in log space so 2x and 0.5x cost the same.
    const aspectPenalty = Math.abs(Math.log(tileWidth / tileHeight / TARGET))
    const score = Math.log(tileWidth * tileHeight) - aspectPenalty * 2
    if (score > bestScore) {
      bestScore = score
      best = cols
    }
  }
  return best
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

/** Tracks an element's box so the layout can respond to the real space. */
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)')
    const update = () => setIsMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return isMobile
}

export function MeetingStage({
  tiles,
  layout,
  pinnedId,
  onTogglePin,
  speakingIds,
  levels,
  activeSpeakerId,
  hideSelfView,
}: MeetingStageProps) {
  const isMobile = useIsMobile()
  const [sizeRef, size] = useElementSize<HTMLDivElement>()
  const [page, setPage] = useState(0)
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null)

  const screens = useMemo(() => tiles.filter((tile) => tile.kind === 'screen'), [tiles])
  const cameras = useMemo(() => tiles.filter((tile) => tile.kind === 'camera'), [tiles])

  // Follow the newest share, and fall back cleanly when one ends.
  useEffect(() => {
    if (screens.length === 0) {
      setSelectedScreenId(null)
      return
    }
    setSelectedScreenId((current) => {
      if (current && screens.some((screen) => screen.id === current)) return current
      return screens[screens.length - 1].id
    })
  }, [screens])

  // People leaving can shrink the grid below the current page.
  useEffect(() => {
    const perPageNow = isMobile ? 4 : 12
    const pages = Math.max(1, Math.ceil(tiles.length / perPageNow))
    setPage((current) => Math.min(current, pages - 1))
  }, [tiles.length, isMobile])

  const pinnedTile = pinnedId ? tiles.find((tile) => tile.id === pinnedId) ?? null : null
  const selectedScreen = selectedScreenId
    ? screens.find((screen) => screen.id === selectedScreenId) ?? null
    : null

  // What ends up on the big tile, and whether we use the stage layout at all.
  const featured = useMemo(() => {
    if (pinnedTile) return pinnedTile
    if (layout === 'grid') return null
    if (selectedScreen) return selectedScreen
    if (layout === 'spotlight') {
      const active = activeSpeakerId
        ? cameras.find((tile) => tile.socketId === activeSpeakerId)
        : null
      return active ?? cameras[0] ?? null
    }
    return null
  }, [pinnedTile, layout, selectedScreen, activeSpeakerId, cameras])

  // The self tile is kept when it would otherwise leave the stage empty.
  const visibleCameras = useMemo(() => {
    if (!hideSelfView || cameras.length <= 1) return cameras
    return cameras.filter((tile) => !tile.isLocal)
  }, [cameras, hideSelfView])

  const tileProps = (tile: Tile) => ({
    tile,
    isSpeaking: tile.kind === 'camera' && !!speakingIds[tile.socketId],
    level: levels[tile.socketId] ?? 0,
    isPinned: pinnedId === tile.id,
    onTogglePin: () => onTogglePin(tile.id),
  })

  // ── Stage layout: one featured tile plus a filmstrip ─────────────────────
  if (featured) {
    const strip = [
      ...visibleCameras.filter((tile) => tile.id !== featured.id),
      ...screens.filter((screen) => screen.id !== featured.id),
    ]

    return (
      <div className="flex flex-col w-full h-full gap-1.5 p-1.5">
        {/* Selector when several people present at once */}
        {screens.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto flex-shrink-0 pb-0.5">
            <span className="text-muted text-xs flex items-center gap-1 flex-shrink-0 pr-1">
              <MonitorUp size={12} />
              {screens.length} screens
            </span>
            {screens.map((screen) => (
              <button
                key={screen.id}
                onClick={() => {
                  setSelectedScreenId(screen.id)
                  if (pinnedId) onTogglePin(pinnedId)
                }}
                className={clsx(
                  'flex-shrink-0 text-xs font-medium rounded-full px-3 py-1 transition-colors touch-manipulation',
                  screen.id === featured.id
                    ? 'bg-accent text-app'
                    : 'bg-elevated text-primary hover:bg-avatar'
                )}
              >
                {screen.isLocal ? 'You' : screen.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 flex flex-col sm:flex-row gap-1.5 min-h-0">
          <div className="flex-1 min-w-0 min-h-0">
            <VideoTile {...tileProps(featured)} featured className="w-full h-full" />
          </div>

          {strip.length > 0 && (
            // Horizontal strip under the stage on phones, vertical rail on wider screens.
            <div className="flex sm:flex-col gap-1.5 h-20 sm:h-auto w-full sm:w-40 md:w-48 flex-shrink-0 overflow-x-auto sm:overflow-x-hidden sm:overflow-y-auto">
              {strip.map((tile) => (
                <div
                  key={tile.id}
                  className="h-full aspect-video flex-shrink-0 sm:w-full sm:h-auto"
                >
                  <VideoTile {...tileProps(tile)} compact className="w-full h-full" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Grid layout ─────────────────────────────────────────────────────────
  const allGridTiles = [...screens, ...visibleCameras]
  const perPage = isMobile ? 4 : 12
  const pageCount = Math.max(1, Math.ceil(allGridTiles.length / perPage))
  const safePage = Math.min(page, pageCount - 1)
  const pageTiles = allGridTiles.slice(safePage * perPage, safePage * perPage + perPage)

  const columns = bestColumns(pageTiles.length, size.width, size.height)
  const rows = chunk(pageTiles, columns)

  return (
    <div className="relative w-full h-full" ref={sizeRef}>
      <div className="flex flex-col gap-1.5 w-full h-full p-1.5">
        {rows.map((row, index) => (
          <div key={index} className="flex-1 flex gap-1.5 justify-center min-h-0">
            {row.map((tile) => (
              <div
                key={tile.id}
                className="flex-1 min-w-0 min-h-0"
                // Capping the width keeps a short final row centred at the same
                // tile size as the full rows above it, instead of stretching.
                style={{ maxWidth: `${100 / columns}%` }}
              >
                <VideoTile {...tileProps(tile)} className="w-full h-full" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {pageCount > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 backdrop-blur rounded-full px-2 py-1.5">
          <button
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={safePage === 0}
            className="text-white disabled:text-subtle p-1 touch-manipulation"
            title="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-white text-xs font-medium tabular-nums">
            {safePage + 1} / {pageCount}
          </span>
          <button
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            disabled={safePage >= pageCount - 1}
            className="text-white disabled:text-subtle p-1 touch-manipulation"
            title="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
