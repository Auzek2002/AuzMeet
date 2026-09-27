import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Supplies ICE servers to the browser.
 *
 * STUN alone only works when at least one peer is directly reachable — which is
 * why calls succeed on one network and fail between two. Two people behind
 * different NATs need a TURN server to relay the media, so one must be
 * configured for the app to work over the internet.
 *
 * Providers are tried in order; the first one configured wins. See DEPLOYMENT.md.
 */

interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

interface TurnResult {
  iceServers: IceServer[]
  provider: string
  hasTurn: boolean
  warning?: string
}

const STUN_ONLY: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

/** Credentials are short-lived; cache briefly so every join is not a round trip. */
let cache: { result: TurnResult; expiresAt: number } | null = null
const CACHE_MS = 5 * 60 * 1000

const env = (name: string): string | undefined => {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : undefined
}

/** Any provider, or your own coturn: the simplest possible escape hatch. */
function fromGenericEnv(): TurnResult | null {
  const urls = env('TURN_URLS')
  const username = env('TURN_USERNAME')
  const credential = env('TURN_CREDENTIAL')
  if (!urls || !username || !credential) return null

  return {
    iceServers: [
      ...STUN_ONLY,
      { urls: urls.split(',').map((u) => u.trim()).filter(Boolean), username, credential },
    ],
    provider: 'custom',
    hasTurn: true,
  }
}

/** Metered, using an API key to mint fresh credentials. */
async function fromMeteredApi(): Promise<TurnResult | null> {
  const domain = env('METERED_DOMAIN')
  const apiKey = env('METERED_API_KEY')
  if (!domain || !apiKey) return null

  const host = domain.replace(/^https?:\/\//, '')
  const res = await fetch(`https://${host}/api/v1/turn/credentials?apiKey=${apiKey}`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Metered API responded ${res.status}`)

  const servers = (await res.json()) as IceServer[]
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error('Metered API returned no ICE servers')
  }

  return {
    iceServers: servers,
    provider: 'metered-api',
    hasTurn: servers.some((s) => String(s.urls).includes('turn')),
  }
}

/** Metered, using the static username/password from the dashboard. */
function fromMeteredStatic(): TurnResult | null {
  const domain = env('METERED_DOMAIN')
  const username = env('METERED_TURN_USERNAME')
  const credential = env('METERED_TURN_CREDENTIAL')
  if (!domain || !username || !credential) return null

  const host = domain.replace(/^https?:\/\//, '')
  return {
    iceServers: [
      { urls: `stun:${host}:3478` },
      { urls: `turn:${host}:80`, username, credential },
      { urls: `turn:${host}:80?transport=tcp`, username, credential },
      { urls: `turn:${host}:443`, username, credential },
      // TLS on 443 is the one that survives restrictive corporate firewalls.
      { urls: `turns:${host}:443?transport=tcp`, username, credential },
    ],
    provider: 'metered-static',
    hasTurn: true,
  }
}

/** Cloudflare Calls TURN. */
async function fromCloudflare(): Promise<TurnResult | null> {
  const keyId = env('CLOUDFLARE_TURN_KEY_ID')
  const token = env('CLOUDFLARE_TURN_API_TOKEN')
  if (!keyId || !token) return null

  const res = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 86400 }),
      cache: 'no-store',
    }
  )
  if (!res.ok) throw new Error(`Cloudflare responded ${res.status}`)

  const data = (await res.json()) as { iceServers?: IceServer | IceServer[] }
  const servers = Array.isArray(data.iceServers)
    ? data.iceServers
    : data.iceServers
    ? [data.iceServers]
    : []
  if (servers.length === 0) throw new Error('Cloudflare returned no ICE servers')

  return { iceServers: [...STUN_ONLY, ...servers], provider: 'cloudflare', hasTurn: true }
}

/** Twilio Network Traversal Service. */
async function fromTwilio(): Promise<TurnResult | null> {
  const sid = env('TWILIO_ACCOUNT_SID')
  const authToken = env('TWILIO_AUTH_TOKEN')
  if (!sid || !authToken) return null

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Tokens.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Twilio responded ${res.status}`)

  const data = (await res.json()) as {
    ice_servers?: { url?: string; urls?: string; username?: string; credential?: string }[]
  }
  const servers = (data.ice_servers ?? []).map((s) => ({
    urls: (s.urls ?? s.url) as string,
    username: s.username,
    credential: s.credential,
  }))
  if (servers.length === 0) throw new Error('Twilio returned no ICE servers')

  return { iceServers: servers, provider: 'twilio', hasTurn: true }
}

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json(cache.result)
  }

  const providers: [string, () => TurnResult | null | Promise<TurnResult | null>][] = [
    ['custom', fromGenericEnv],
    ['metered-api', fromMeteredApi],
    ['metered-static', fromMeteredStatic],
    ['cloudflare', fromCloudflare],
    ['twilio', fromTwilio],
  ]

  for (const [name, load] of providers) {
    try {
      const result = await load()
      if (result) {
        cache = { result, expiresAt: Date.now() + CACHE_MS }
        console.log(`[TURN] using ${result.provider} (${result.iceServers.length} ICE servers)`)
        return NextResponse.json(result)
      }
    } catch (err) {
      // A misconfigured provider should not silently fall through to a broken
      // call — log loudly and try the next one.
      console.error(`[TURN] ${name} failed:`, err instanceof Error ? err.message : err)
    }
  }

  // No relay at all. Previously this fell back to a public test server whose
  // credentials no longer work, which looked configured but produced zero relay
  // candidates. Better to be explicit so the UI can warn before the call fails.
  const result: TurnResult = {
    iceServers: STUN_ONLY,
    provider: 'none',
    hasTurn: false,
    warning:
      'No TURN server is configured. Calls will work between people on the same network, ' +
      'but will fail between different networks. See DEPLOYMENT.md.',
  }
  console.warn(`[TURN] ${result.warning}`)
  return NextResponse.json(result)
}
