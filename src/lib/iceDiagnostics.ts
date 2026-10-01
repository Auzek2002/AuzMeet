/**
 * Checks whether this browser can actually obtain a TURN **relay** candidate.
 *
 * This is the single question that decides whether calls work between people on
 * different networks:
 *
 *   host  - your machine's own address. Enough on one LAN.
 *   srflx - your public address, discovered via STUN. Enough when at least one
 *           side's NAT is permissive.
 *   relay - allocated on a TURN server. Required when both sides are behind
 *           NATs that will not accept an inbound connection.
 *
 * No relay candidates means cross-network calls will sit at "Connecting…".
 */

export type CandidateType = 'host' | 'srflx' | 'relay' | 'prflx'

/** Public STUN used to test the network itself, independent of the server config. */
const BASELINE_STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

export interface IceDiagnostics {
  provider: string
  hasTurn: boolean
  warning?: string
  iceServers: { urls: string | string[]; hasCredentials: boolean }[]
  counts: Record<CandidateType, number>
  relayProtocols: string[]
  errors: { code: number; text: string; url: string }[]
  durationMs: number
  /** Server-reflexive candidates from public STUN alone. 0 means UDP is blocked. */
  baselineSrflx: number
  verdict: 'ok' | 'udp-blocked' | 'turn-broken' | 'no-turn-configured'
}

interface GatherResult {
  counts: Record<CandidateType, number>
  relayProtocols: Set<string>
  errors: { code: number; text: string; url: string }[]
}

/** Gathers candidates for one ICE configuration and reports what came back. */
async function gather(iceServers: RTCIceServer[], timeoutMs: number): Promise<GatherResult> {
  const counts: Record<CandidateType, number> = { host: 0, srflx: 0, relay: 0, prflx: 0 }
  const relayProtocols = new Set<string>()
  const errors: { code: number; text: string; url: string }[] = []

  const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 0 })

  pc.addEventListener('icecandidateerror', (event) => {
    const e = event as RTCPeerConnectionIceErrorEvent
    if (errors.length < 12) {
      errors.push({ code: e.errorCode, text: e.errorText || '', url: e.url || '' })
    }
  })

  pc.createDataChannel('diagnostics')
  await pc.setLocalDescription(await pc.createOffer())

  await new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    pc.onicecandidate = (event) => {
      if (!event.candidate) return finish()
      const match = event.candidate.candidate.match(/ typ (host|srflx|relay|prflx)/)
      if (!match) return
      const type = match[1] as CandidateType
      counts[type] += 1
      if (type === 'relay') relayProtocols.add(event.candidate.protocol || 'udp')
    }
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') finish()
    }
    setTimeout(finish, timeoutMs)
  })

  pc.close()
  return { counts, relayProtocols, errors }
}

const GATHER_TIMEOUT_MS = 15000

export async function runIceDiagnostics(): Promise<IceDiagnostics> {
  const started = Date.now()

  const res = await fetch('/api/turn-credentials', { cache: 'no-store' })
  const data = (await res.json()) as {
    iceServers: RTCIceServer[]
    provider?: string
    hasTurn?: boolean
    warning?: string
  }

  // Two probes. The baseline uses public STUN only, so it measures the network
  // rather than the configuration: if it cannot get a server-reflexive
  // candidate either, UDP is being blocked and no TURN setting will fix that.
  const [baseline, full] = await Promise.all([
    gather(BASELINE_STUN, 8000),
    gather(data.iceServers ?? [], GATHER_TIMEOUT_MS),
  ])

  const hasTurn = data.hasTurn ?? false
  const verdict: IceDiagnostics['verdict'] =
    full.counts.relay > 0
      ? 'ok'
      : !hasTurn
      ? 'no-turn-configured'
      : baseline.counts.srflx === 0
      ? 'udp-blocked'
      : 'turn-broken'

  return {
    provider: data.provider ?? 'unknown',
    hasTurn,
    warning: data.warning,
    iceServers: (data.iceServers ?? []).map((s) => ({
      urls: s.urls,
      hasCredentials: !!s.username,
    })),
    counts: full.counts,
    relayProtocols: Array.from(full.relayProtocols),
    errors: full.errors,
    baselineSrflx: baseline.counts.srflx,
    durationMs: Date.now() - started,
    verdict,
  }
}
