import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const domain     = process.env.METERED_DOMAIN          // e.g. auzmeet.metered.live
  const username   = process.env.METERED_TURN_USERNAME   // username from TURN Credentials page
  const credential = process.env.METERED_TURN_CREDENTIAL // password from TURN Credentials page

  // If Metered env vars are configured, use them
  if (domain && username && credential) {
    return NextResponse.json({
      iceServers: [
        { urls: `stun:${domain}:3478` },
        { urls: `turn:${domain}:80`,                username, credential },
        { urls: `turn:${domain}:443`,               username, credential },
        { urls: `turn:${domain}:3478`,              username, credential },
        { urls: `turn:${domain}:443?transport=tcp`, username, credential },
        { urls: `turns:${domain}:443`,              username, credential },
      ],
    })
  }

  // Fallback: OpenRelay free public TURN (no sign-up, works out of the box)
  console.warn('[TURN] Metered env vars not set — falling back to OpenRelay')
  return NextResponse.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ],
  })
}
