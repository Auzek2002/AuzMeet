# Deploying AuzMeet

## Why the Vercel deployment showed "Reconnecting…"

AuzMeet needs a **signaling server**: a process that stays alive, holds a
WebSocket open to every participant, and keeps the room list in memory so it can
introduce peers to each other.

Vercel runs `next build` and serves the result as **serverless functions**. It
never executes `server.js`, so the signaling server simply was not running. The
browser kept trying to open a socket against the site's own origin, got nothing
back, and the banner stayed up. The Vercel logs show it clearly — page requests
and `/api/turn-credentials`, and not a single `socket.io` request.

This is not something a code change can fix on Vercel serverless:

- serverless functions do not accept WebSocket upgrades, and
- each invocation is isolated and short-lived, so in-memory room state cannot
  survive between requests.

So pick one of the two layouts below.

---

## Option A — one service, everything together (simplest)

Deploy the whole app to a host that runs a normal long-lived Node process:
**Render, Railway, Fly.io, DigitalOcean App Platform, or any VPS/Docker host.**

```
Build command:  npm ci && npm run build
Start command:  npm start
```

`npm start` runs `server.js`, which serves the Next.js app *and* the signaling
server on one port. Nothing else to configure — they share an origin, so
`NEXT_PUBLIC_SIGNALING_URL` is not needed.

A `render.yaml` blueprint and a `Dockerfile` are both included.

---

## Option B — keep the frontend on Vercel

Vercel keeps serving the UI; the signaling server runs somewhere persistent.

**1. Deploy the signaling server** (Render, Railway, Fly.io, a VPS):

```
Build command:  npm ci
Start command:  npm run signaling
Health check:   /health
```

Set `ALLOWED_ORIGINS` to your Vercel domain, e.g.
`https://auz-meet.vercel.app`. Confirm it is alive by opening
`https://<your-signaling-host>/health` — it returns JSON.

**2. Point the Vercel app at it.** In the Vercel dashboard, under
*Settings → Environment Variables*, add:

```
NEXT_PUBLIC_SIGNALING_URL = https://<your-signaling-host>
```

**3. Redeploy on Vercel.** This matters: `NEXT_PUBLIC_*` values are baked in at
**build** time, so setting the variable without rebuilding changes nothing.

The signaling host must serve **HTTPS** (`https://`, not `http://`). A page
served over HTTPS cannot open a plaintext WebSocket to it — the browser blocks
the connection as mixed content.

---

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SIGNALING_URL` | web app (build time) | Signaling server URL. Empty = same origin. |
| `ALLOWED_ORIGINS` | signaling server | Comma-separated allowed origins. `*` by default. |
| `MAX_PARTICIPANTS` | signaling server | Room capacity, default 16. |
| `PORT` / `HOST` | both | Listen address. Hosts normally inject `PORT`. |
| `METERED_DOMAIN`, `METERED_TURN_USERNAME`, `METERED_TURN_CREDENTIAL` | web app (runtime) | TURN credentials — see below. |

## Set up TURN before you call it done

Your logs show `[TURN] Metered env vars not set — falling back to OpenRelay`.
The fallback is a free shared service and is regularly unreachable; when it is,
anyone behind a strict NAT or corporate firewall connects to the room but never
receives video.

Create a free TURN project (e.g. Metered), then set `METERED_DOMAIN`,
`METERED_TURN_USERNAME` and `METERED_TURN_CREDENTIAL` on the **web app**
(they are read at runtime by `/api/turn-credentials`, so no rebuild is needed).

## Scaling note

Room state lives in memory in one process, so run **exactly one instance** of
the signaling server. Running two behind a load balancer puts participants in
different copies of the same room and they will not see each other. Going
multi-instance means adding a Socket.IO Redis adapter and sharing room state.

## Verifying a deployment

1. `https://<signaling-host>/health` returns `{"status":"ok"}`.
2. Open the meeting link in two browsers — each should see the other.
3. If the banner says **"Can't reach the meeting server"**, the signaling
   server is not running or is not reachable from the browser; the message says
   which URL it tried.
