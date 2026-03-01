import { NextResponse } from 'next/server'

// This route runs SERVER-SIDE only.
// The secret key is never exposed to the browser.
export async function GET() {
  const domain = process.env.METERED_DOMAIN       // e.g. auzmeet.metered.live
  const secretKey = process.env.METERED_SECRET_KEY // your secret key from Metered dashboard

  // If env vars are not set, fall back to free public TURN (OpenRelay)
  if (!domain || !secretKey) {
    return NextResponse.json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80',              username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443',             username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
    })
  }

  try {
    // Metered returns a ready-to-use array of ICE servers
    const res = await fetch(
      `https://${domain}/api/v1/turn/credentials?apiKey=${secretKey}`
    )

    if (!res.ok) throw new Error(`Metered API error: ${res.status}`)

    const iceServers = await res.json()
    return NextResponse.json({ iceServers })
  } catch (err) {
    console.error('[TURN] Failed to fetch credentials from Metered:', err)
    // Return STUN-only as last resort (still better than nothing)
    return NextResponse.json({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
  }
}
