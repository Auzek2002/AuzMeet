import { RecordingMode } from '@/types'

/**
 * One surface the recorder should draw. The caller re-supplies the list every
 * frame, so people joining, leaving or starting a share are picked up live
 * without restarting the recording.
 */
export interface FrameSource {
  id: string
  stream: MediaStream | null
  label: string
  isScreen: boolean
  /** False when the camera is off - draws an initials avatar instead. */
  showVideo: boolean
  isMuted: boolean
  isSpeaking: boolean
}

export interface RecorderResult {
  blob: Blob
  mimeType: string
  durationMs: number
}

export interface RecorderConfig {
  mode: RecordingMode
  /** Re-evaluated on every composited frame. */
  getSources: () => FrameSource[]
  /** Streams whose audio is mixed into the recording. */
  getAudioStreams: () => { id: string; stream: MediaStream }[]
  width?: number
  height?: number
  fps?: number
  /** Drawn in the header - usually the meeting code. */
  title?: string
  /**
   * When this returns a track, the recorder muxes it straight through instead
   * of compositing. Used for screen recordings: a shared desktop keeps its own
   * resolution, so text stays as sharp in the file as it was on screen, and no
   * canvas re-scale is involved.
   */
  getDirectVideoTrack?: () => MediaStreamTrack | null
  videoBitsPerSecond?: number
}

const PALETTE = {
  bg: '#16171a',
  tile: '#26282c',
  tileEdge: '#34363b',
  speaking: '#8ab4f8',
  text: '#e8eaed',
  muted: '#9aa0a6',
  avatar: '#4a4d52',
  rec: '#ea4335',
}

const CANDIDATE_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=h264,opus',
  'video/webm',
  'video/mp4',
]

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

export function isRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  )
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  )
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** A decoded frame ready to draw, with its true pixel dimensions. */
interface SourceImage {
  image: CanvasImageSource
  width: number
  height: number
}

/** Fills the box, cropping overflow - used for camera tiles. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  frame: SourceImage,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const { width: vw, height: vh } = frame
  if (!vw || !vh) return
  const scale = Math.max(w / vw, h / vh)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(frame.image, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h)
}

/** Letterboxes inside the box - used for shared screens, which must not crop. */
function drawContain(
  ctx: CanvasRenderingContext2D,
  frame: SourceImage,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const { width: vw, height: vh } = frame
  if (!vw || !vh) return
  const scale = Math.min(w / vw, h / vh)
  const dw = vw * scale
  const dh = vh * scale
  ctx.drawImage(frame.image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

/**
 * Supplies the latest frame of a video track to the compositor.
 *
 * Two implementations, and which one is used decides whether a recording keeps
 * moving while the tab is in the background:
 *
 * - `TrackFrameProvider` pulls frames straight off the MediaStreamTrack with
 *   WebCodecs. It is fed by the decoder/screen-capturer, which keeps running
 *   when the page is hidden.
 * - `VideoElementProvider` renders into a hidden <video>. Browsers stop
 *   painting those in background tabs, so drawImage returns the last frame and
 *   the recording appears frozen. Fallback only.
 */
interface FrameProvider {
  readonly track: MediaStreamTrack | null
  current(): SourceImage | null
  close(): void
}

type TrackProcessorCtor = new (init: {
  track: MediaStreamTrack
  maxBufferSize?: number
}) => {
  readable: ReadableStream<VideoFrame>
}

function trackProcessorSupported(): boolean {
  return typeof window !== 'undefined' && 'MediaStreamTrackProcessor' in window
}

class TrackFrameProvider implements FrameProvider {
  private latest: VideoFrame | null = null
  private reader: ReadableStreamDefaultReader<VideoFrame> | null = null
  private closed = false

  constructor(public readonly track: MediaStreamTrack) {
    const Ctor = (window as unknown as { MediaStreamTrackProcessor: TrackProcessorCtor })
      .MediaStreamTrackProcessor
    // Only the newest frame is ever drawn, so queue depth 1. A deeper queue
    // builds up whenever compositing lags behind capture, and frames dropped
    // from it are collected without close() - which stalls the pipeline.
    const processor = new Ctor({ track, maxBufferSize: 1 })
    this.reader = processor.readable.getReader()
    void this.pump()
  }

  private async pump(): Promise<void> {
    const reader = this.reader
    if (!reader) return
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (this.closed) {
          value?.close()
          break
        }
        // Only the newest frame is ever drawn; release the one it replaces.
        this.latest?.close()
        this.latest = value ?? null
      }
    } catch {
      // The track ended or was replaced; the provider is simply done.
    } finally {
      // Cancellation happens here rather than in close(), so the reader is
      // only released once this loop has taken delivery of - and closed - the
      // frame that was already in flight. close() is safe to call twice.
      this.latest?.close()
      this.latest = null
      try {
        await reader.cancel()
      } catch {
        /* already released */
      }
    }
  }

  current(): SourceImage | null {
    const frame = this.latest
    if (!frame) return null
    return { image: frame, width: frame.displayWidth, height: frame.displayHeight }
  }

  close(): void {
    // Flag only: the pump loop does the releasing, so a frame that is already
    // in flight cannot be collected without close().
    this.closed = true
    this.latest?.close()
    this.latest = null
    this.reader = null
  }
}

class VideoElementProvider implements FrameProvider {
  private element: HTMLVideoElement

  constructor(
    public readonly track: MediaStreamTrack | null,
    stream: MediaStream,
    holder: HTMLElement | null
  ) {
    this.element = document.createElement('video')
    this.element.muted = true
    this.element.autoplay = true
    this.element.playsInline = true
    this.element.srcObject = stream
    holder?.appendChild(this.element)
    void this.element.play().catch(() => {})
  }

  current(): SourceImage | null {
    const el = this.element
    if (el.readyState < 2 || !el.videoWidth) return null
    return { image: el, width: el.videoWidth, height: el.videoHeight }
  }

  close(): void {
    this.element.srcObject = null
    this.element.remove()
  }
}

/**
 * Records the meeting entirely in the browser: participant video is composited
 * onto a canvas while every audio track is mixed through WebAudio, and the two
 * are muxed by MediaRecorder into a single downloadable file.
 */
export class MeetingRecorder {
  private config: Required<Pick<RecorderConfig, 'width' | 'height' | 'fps'>> & RecorderConfig
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private lastFrameAt = 0

  /**
   * The compositor is clocked from a Web Worker rather than
   * requestAnimationFrame. Chrome suspends rAF entirely while a tab is in the
   * background, which froze the recording the moment someone switched tabs -
   * exactly when a screen recording is most likely to matter. Worker timers
   * keep running, so frames are still composited and pushed while hidden.
   */
  private ticker: Worker | null = null
  private tickerUrl: string | null = null
  private rafId: number | null = null
  /** Explicit frame source for the canvas; see captureStream(0) below. */
  private canvasTrack: CanvasCaptureMediaStreamTrack | null = null

  /** One frame provider per surface being drawn. */
  private providers = new Map<string, FrameProvider>()
  private holder: HTMLDivElement | null = null

  private audioCtx: AudioContext | null = null
  private mixDestination: MediaStreamAudioDestinationNode | null = null
  private audioNodes = new Map<string, MediaStreamAudioSourceNode>()

  private startedAt = 0
  private accumulatedMs = 0
  private paused = false
  private mimeType = ''
  /** True when muxing a source track straight through, bypassing the canvas. */
  private direct = false

  constructor(config: RecorderConfig) {
    this.config = {
      width: 1280,
      height: 720,
      fps: 25,
      ...config,
    }

    this.canvas = document.createElement('canvas')
    this.canvas.width = this.config.width
    this.canvas.height = this.config.height
    const ctx = this.canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    this.ctx = ctx
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────
  start(): void {
    this.mimeType = pickMimeType()
    if (!this.mimeType) throw new Error('This browser cannot record video')

    this.holder = document.createElement('div')
    this.holder.setAttribute('aria-hidden', 'true')
    this.holder.style.cssText =
      'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
    document.body.appendChild(this.holder)

    this.audioCtx = new AudioContext()
    this.mixDestination = this.audioCtx.createMediaStreamDestination()
    this.syncAudio()
    // Some browsers suspend an AudioContext when the page is hidden; resuming
    // on every sync keeps the mixed audio flowing for the whole recording.
    void this.audioCtx.resume().catch(() => {})

    // A screen recording is muxed from its own track; everything else is drawn.
    const directTrack = this.config.getDirectVideoTrack?.() ?? null
    this.direct = !!directTrack

    let videoTracks: MediaStreamTrack[]
    if (directTrack) {
      videoTracks = [directTrack]
    } else {
      // A frame rate of 0 means "capture only when asked", so every tick of the
      // compositor produces exactly one frame - including while hidden, where
      // automatic capture would otherwise stall along with the tab.
      const canvasStream = this.canvas.captureStream(0)
      const track = canvasStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
      this.canvasTrack = typeof track?.requestFrame === 'function' ? track : null
      if (!this.canvasTrack) {
        // Very old browsers: fall back to automatic capture at the target rate.
        videoTracks = this.canvas.captureStream(this.config.fps).getVideoTracks()
      } else {
        videoTracks = [track]
      }
    }

    const output = new MediaStream([
      ...videoTracks,
      ...this.mixDestination.stream.getAudioTracks(),
    ])

    this.recorder = new MediaRecorder(output, {
      mimeType: this.mimeType,
      videoBitsPerSecond:
        this.config.videoBitsPerSecond ?? (this.direct ? 8_000_000 : 3_000_000),
      audioBitsPerSecond: 128_000,
    })
    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data)
    }
    // Flush in slices so a crash or an early stop still leaves usable data.
    this.recorder.start(2000)

    this.startedAt = performance.now()
    this.accumulatedMs = 0
    this.paused = false
    // Passthrough needs no draw loop at all.
    if (!this.direct) this.startTicker()
  }

  pause(): void {
    if (!this.recorder || this.paused || this.recorder.state !== 'recording') return
    this.recorder.pause()
    this.accumulatedMs += performance.now() - this.startedAt
    this.paused = true
  }

  resume(): void {
    if (!this.recorder || !this.paused) return
    this.recorder.resume()
    this.startedAt = performance.now()
    this.paused = false
  }

  get isPaused(): boolean {
    return this.paused
  }

  /** Milliseconds of recorded material, excluding paused time. */
  elapsedMs(): number {
    return this.paused ? this.accumulatedMs : this.accumulatedMs + (performance.now() - this.startedAt)
  }

  async stop(): Promise<RecorderResult> {
    const durationMs = this.elapsedMs()

    this.stopTicker()

    const blob = await new Promise<Blob>((resolve) => {
      const recorder = this.recorder
      if (!recorder || recorder.state === 'inactive') {
        resolve(new Blob(this.chunks, { type: this.mimeType || 'video/webm' }))
        return
      }
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: this.mimeType || 'video/webm' }))
      recorder.stop()
    })

    this.teardown()
    return { blob, mimeType: this.mimeType || 'video/webm', durationMs }
  }

  private teardown(): void {
    this.stopTicker()
    this.canvasTrack = null
    this.providers.forEach((provider) => provider.close())
    this.providers.clear()

    this.audioNodes.forEach((node) => node.disconnect())
    this.audioNodes.clear()
    this.audioCtx?.close().catch(() => {})
    this.audioCtx = null
    this.mixDestination = null

    this.holder?.remove()
    this.holder = null
    this.recorder = null
  }

  // ── Audio mixing ───────────────────────────────────────────────────────
  /** Adds and removes mixer inputs so late joiners are captured too. */
  syncAudio(): void {
    if (!this.audioCtx || !this.mixDestination) return
    if (this.audioCtx.state === 'suspended') void this.audioCtx.resume().catch(() => {})
    const wanted = this.config.getAudioStreams()
    const wantedIds = new Set(wanted.map((entry) => entry.id))

    this.audioNodes.forEach((node, id) => {
      if (!wantedIds.has(id)) {
        node.disconnect()
        this.audioNodes.delete(id)
      }
    })

    for (const { id, stream } of wanted) {
      if (this.audioNodes.has(id)) continue
      if (stream.getAudioTracks().length === 0) continue
      try {
        const node = this.audioCtx.createMediaStreamSource(stream)
        node.connect(this.mixDestination)
        this.audioNodes.set(id, node)
      } catch (err) {
        console.warn(`[Recorder] could not mix audio for ${id}:`, err)
      }
    }
  }

  // ── Frame compositing ──────────────────────────────────────────────────
  private imageFor(source: FrameSource): SourceImage | null {
    const track = source.stream?.getVideoTracks()[0] ?? null
    if (!source.stream || !track) {
      const stale = this.providers.get(source.id)
      if (stale) {
        stale.close()
        this.providers.delete(source.id)
      }
      return null
    }

    let provider = this.providers.get(source.id)
    // Rebuild when the underlying track changes - a camera swap, or a screen
    // share that stopped and started again.
    if (provider && provider.track !== track) {
      provider.close()
      provider = undefined
      this.providers.delete(source.id)
    }

    if (!provider) {
      try {
        provider = trackProcessorSupported()
          ? new TrackFrameProvider(track)
          : new VideoElementProvider(track, source.stream, this.holder)
      } catch (err) {
        console.warn('[Recorder] falling back to video element for', source.id, err)
        provider = new VideoElementProvider(track, source.stream, this.holder)
      }
      this.providers.set(source.id, provider)
    }

    return provider.current()
  }

  private startTicker(): void {
    const interval = Math.max(1, Math.round(1000 / this.config.fps))

    try {
      // Inline worker: no extra file to serve, and its timer is not subject to
      // the background-tab throttling that applies to the page.
      const source = `let h=null;onmessage=e=>{if(e.data&&e.data.type==='start'){clearInterval(h);h=setInterval(()=>postMessage(0),e.data.interval)}else{clearInterval(h);h=null}}`
      const blob = new Blob([source], { type: 'application/javascript' })
      this.tickerUrl = URL.createObjectURL(blob)
      this.ticker = new Worker(this.tickerUrl)
      this.ticker.onmessage = this.tick
      this.ticker.postMessage({ type: 'start', interval })
      return
    } catch (err) {
      console.warn('[Recorder] worker clock unavailable, falling back to rAF:', err)
    }

    // Fallback only; this one does freeze while the tab is in the background.
    const loop = () => {
      this.rafId = requestAnimationFrame(loop)
      const now = performance.now()
      if (now - this.lastFrameAt < interval) return
      this.lastFrameAt = now
      this.tick()
    }
    loop()
  }

  private tick = (): void => {
    try {
      this.drawFrame()
      // Hand the freshly drawn canvas to the encoder.
      this.canvasTrack?.requestFrame()
    } catch (err) {
      console.warn('[Recorder] frame draw failed:', err)
    }
  }

  private stopTicker(): void {
    if (this.ticker) {
      this.ticker.postMessage({ type: 'stop' })
      this.ticker.terminate()
      this.ticker = null
    }
    if (this.tickerUrl) {
      URL.revokeObjectURL(this.tickerUrl)
      this.tickerUrl = null
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private drawFrame(): void {
    const { ctx } = this
    const W = this.canvas.width
    const H = this.canvas.height
    const sources = this.config.getSources()

    ctx.fillStyle = PALETTE.bg
    ctx.fillRect(0, 0, W, H)

    const headerH = 44
    this.drawHeader(W, headerH)

    const top = headerH
    const availH = H - headerH
    const pad = 10

    if (sources.length === 0) {
      ctx.fillStyle = PALETTE.muted
      ctx.font = '500 20px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Waiting for participants…', W / 2, top + availH / 2)
      ctx.textAlign = 'left'
      return
    }

    // Single-source modes fill the whole frame.
    if (this.config.mode !== 'meeting') {
      this.drawTile(sources[0], pad, top + pad, W - pad * 2, availH - pad * 2, {
        contain: sources[0].isScreen,
        labelSize: 16,
      })
      return
    }

    const screens = sources.filter((s) => s.isScreen)
    const cameras = sources.filter((s) => !s.isScreen)

    if (screens.length > 0) {
      // Shared screen takes the stage; cameras run down a side rail.
      const railW = cameras.length > 0 ? Math.round(W * 0.2) : 0
      const stageW = W - railW - pad * (railW ? 3 : 2)
      const stageH = availH - pad * 2

      this.drawTile(screens[0], pad, top + pad, stageW, stageH, {
        contain: true,
        labelSize: 15,
      })

      if (railW > 0) {
        const railX = pad * 2 + stageW
        const maxVisible = Math.max(1, Math.floor(stageH / (railW * (9 / 16) + pad)))
        const visible = cameras.slice(0, maxVisible)
        const tileH = Math.round(railW * (9 / 16))

        visible.forEach((source, index) => {
          this.drawTile(source, railX, top + pad + index * (tileH + pad), railW, tileH, {
            contain: false,
            labelSize: 11,
          })
        })

        const overflow = cameras.length - visible.length
        if (overflow > 0) {
          ctx.fillStyle = PALETTE.muted
          ctx.font = '500 12px system-ui, sans-serif'
          ctx.fillText(
            `+${overflow} more`,
            railX,
            top + pad + visible.length * (tileH + pad) + 14
          )
        }
      }

      // Additional shares are noted rather than squeezed in.
      if (screens.length > 1) {
        ctx.fillStyle = PALETTE.muted
        ctx.font = '500 12px system-ui, sans-serif'
        ctx.fillText(`+${screens.length - 1} more screen(s) being shared`, pad, H - 6)
      }
      return
    }

    // Plain grid, squarest arrangement that fits everyone.
    const count = Math.min(cameras.length, 16)
    const cols = Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)
    const cellW = (W - pad * (cols + 1)) / cols
    const cellH = (availH - pad * (rows + 1)) / rows

    for (let i = 0; i < count; i += 1) {
      const col = i % cols
      const row = Math.floor(i / cols)
      // Centre the final, possibly short, row.
      const itemsInRow = Math.min(cols, count - row * cols)
      const rowOffset = ((cols - itemsInRow) * (cellW + pad)) / 2

      this.drawTile(
        cameras[i],
        pad + rowOffset + col * (cellW + pad),
        top + pad + row * (cellH + pad),
        cellW,
        cellH,
        { contain: false, labelSize: count > 6 ? 11 : 14 }
      )
    }
  }

  private drawHeader(W: number, h: number): void {
    const { ctx } = this
    ctx.fillStyle = '#1f2125'
    ctx.fillRect(0, 0, W, h)

    ctx.fillStyle = PALETTE.text
    ctx.font = '600 15px system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('AuzMeet', 16, h / 2)

    if (this.config.title) {
      ctx.fillStyle = PALETTE.muted
      ctx.font = '400 13px system-ui, sans-serif'
      ctx.fillText(this.config.title, 96, h / 2)
    }

    // Recording dot + elapsed clock on the right.
    const seconds = Math.floor(this.elapsedMs() / 1000)
    const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
      seconds % 60
    ).padStart(2, '0')}`

    ctx.fillStyle = PALETTE.muted
    ctx.font = '400 13px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(clock, W - 16, h / 2)

    const dotX = W - 16 - ctx.measureText(clock).width - 16
    if (!this.paused) {
      ctx.fillStyle = PALETTE.rec
      ctx.beginPath()
      ctx.arc(dotX, h / 2, 5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }

  private drawTile(
    source: FrameSource,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { contain: boolean; labelSize: number }
  ): void {
    const { ctx } = this
    if (w <= 2 || h <= 2) return

    const radius = Math.min(12, w / 8)

    ctx.save()
    roundRect(ctx, x, y, w, h, radius)
    ctx.fillStyle = source.isScreen ? '#000000' : PALETTE.tile
    ctx.fill()
    ctx.clip()

    const frame = source.showVideo ? this.imageFor(source) : null
    if (frame) {
      if (opts.contain) drawContain(ctx, frame, x, y, w, h)
      else drawCover(ctx, frame, x, y, w, h)
    } else {
      // Camera off (or not yet flowing): initials avatar.
      const r = Math.min(w, h) * 0.18
      ctx.fillStyle = PALETTE.avatar
      ctx.beginPath()
      ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = PALETTE.text
      ctx.font = `600 ${Math.round(r * 0.8)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(initialsOf(source.label), x + w / 2, y + h / 2)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }

    // Label strip along the bottom.
    const stripH = Math.max(20, opts.labelSize + 12)
    const gradient = ctx.createLinearGradient(0, y + h - stripH, 0, y + h)
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(1, 'rgba(0,0,0,0.72)')
    ctx.fillStyle = gradient
    ctx.fillRect(x, y + h - stripH, w, stripH)

    const label = source.isScreen ? `${source.label} - screen` : source.label
    ctx.fillStyle = PALETTE.text
    ctx.font = `500 ${opts.labelSize}px system-ui, sans-serif`
    ctx.textBaseline = 'middle'

    const labelX = x + 10
    const labelY = y + h - stripH / 2
    const maxLabelW = w - 20 - (source.isMuted ? 18 : 0)
    ctx.fillText(this.truncate(label, maxLabelW), labelX, labelY)

    if (source.isMuted) {
      ctx.fillStyle = PALETTE.rec
      ctx.beginPath()
      ctx.arc(x + w - 14, labelY, 5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.textBaseline = 'alphabetic'
    ctx.restore()

    // Speaking outline sits outside the clip so it is never cropped.
    if (source.isSpeaking && !source.isScreen) {
      ctx.strokeStyle = PALETTE.speaking
      ctx.lineWidth = 3
      roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, radius)
      ctx.stroke()
    }
  }

  private truncate(text: string, maxWidth: number): string {
    const { ctx } = this
    if (ctx.measureText(text).width <= maxWidth) return text
    let result = text
    while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
      result = result.slice(0, -1)
    }
    return `${result}…`
  }
}

/** Triggers a browser download for a recorded blob. */
export function downloadBlob(url: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function extensionFor(mimeType: string): string {
  return mimeType.includes('mp4') ? 'mp4' : 'webm'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
