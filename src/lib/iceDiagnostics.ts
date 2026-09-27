/**
 * Checks whether this browser can actually obtain a TURN **relay** candidate.
 *
 * This is the single question that decides whether calls work between people on
 * different networks:
 *
 *   host  — your machine's own address. Enough on one LAN.
 *   srflx — your public address, discovered via STUN. Enough when at least one
 *           side's NAT is permissive.
 *   relay — allocated on a TURN server. Required when both sides are behind
 *           NATs that will not accept an inbound connection.
 *
 * No relay candidates means cross-network calls will sit at "Connecting…".
 */

export type CandidateType = 'host' | 'srflx' | 'relay' | 'prflx'

export interface IceDiagnostics {
  provider: string
  hasTurn: boolean
  warning?: string
  iceServers: { urls: string | string[]; hasCredentials: boolean }[]
  counts: Record<CandidateType, number>
  relayProtocols: string[]
  errors: { code: number; text: string; url: string }[]
  durationMs: number
  verdict: 'ok' | 'no-relay' | 'no-turn-configured'
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

  const counts: Record<CandidateType, number> = { host: 0, srflx: 0, relay: 0, prflx: 0 }
  const relayProtocols = new Set<string>()
  const errors: { code: number; text: string; url: string }[] = []

  const pc = new RTCPeerConnection({ iceServers: data.iceServers, iceCandidatePoolSize: 0 })

  pc.addEventListener('icecandidateerror', (event) => {
    const e = event as RTCPeerConnectionIceErrorEvent
    // 701 is "could not reach the server"; 400/401 mean it answered and refused.
    if (errors.length < 12) {
      errors.push({ code: e.errorCode, text: e.errorText || '', url: e.url || '' })
    }
  })

  // A data channel is enough to make the agent gather candidates.
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
      if (type === 'relay') {
        relayProtocols.add(event.candidate.protocol || 'udp')
      }
    }
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') finish()
    }
    setTimeout(finish, GATHER_TIMEOUT_MS)
  })

  pc.close()

  const hasTurn = data.hasTurn ?? false
  const verdict: IceDiagnostics['verdict'] =
    counts.relay > 0 ? 'ok' : hasTurn ? 'no-relay' : 'no-turn-configured'

  return {
    provider: data.provider ?? 'unknown',
    hasTurn,
    warning: data.warning,
    iceServers: (data.iceServers ?? []).map((s) => ({
      urls: s.urls,
      hasCredentials: !!s.username,
    })),
    counts,
    relayProtocols: Array.from(relayProtocols),
    errors,
    durationMs: Date.now() - started,
    verdict,
  }
}
