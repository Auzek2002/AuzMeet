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
| `GROQ_API_KEY` | web app (runtime) | Enables AI meeting notes. Without it, notes are extracted locally. |
| `GROQ_MODEL` | web app (runtime) | Pin a Groq model. Omit to auto-select from the live model list. |
| `PORT` / `HOST` | both | Listen address. Hosts normally inject `PORT`. |
| `METERED_API_KEY` + `METERED_DOMAIN` | web app (runtime) | Metered, credentials minted per call (preferred). |
| `METERED_TURN_USERNAME`, `METERED_TURN_CREDENTIAL` | web app (runtime) | Metered static credentials. |
| `METERED_TURN_HOST` | web app (runtime) | Relay hostname; defaults to `global.relay.metered.ca`. |

## TURN — required for calls between different networks

**If a call works on your own wifi but everyone shows "Connecting…" when a
friend joins from elsewhere, this is why.**

WebRTC tries three kinds of network path:

| Candidate | Works when |
| --- | --- |
| `host` | both people are on the same network |
| `srflx` (STUN) | at least one side's router accepts an inbound connection |
| `relay` (TURN) | always — traffic is relayed through a server |

Most home routers and every mobile network use NAT that refuses unsolicited
inbound connections. When both sides are like that, only a **TURN relay** can
connect them. STUN is not enough, and STUN is free while TURN costs bandwidth —
which is why there is no usable free public one.

The old code fell back to the public `openrelay.metered.ca` credentials. Those
no longer work: the server answers and rejects them with
`400 TURN allocate error`, so zero relay candidates are produced. That fallback
has been removed, because appearing configured while being broken is worse than
being clearly unconfigured.

### Check what your deployment is doing

Open **`/diagnostics`** on your deployed site. It gathers real ICE candidates
and tells you plainly whether a relay was obtained. Do this first — it answers
the question in about five seconds, without arranging a two-person call.

### Configure one of these

Set the variables on the **web app** service and redeploy. They are read at
request time by `/api/turn-credentials`.

**Metered** (simplest; free tier is generous)

Metered uses **two different hostnames**, and mixing them up is the single
easiest way to get a config that looks correct and never connects:

| Hostname | What it is |
| --- | --- |
| `<yourapp>.metered.live` | the **API**, used only to mint credentials. An HTTP CDN — it does not speak TURN. |
| `global.relay.metered.ca` | the **TURN relays** themselves. |

Pointing TURN at the API host resolves fine and even accepts a TCP connection,
then fails every allocation with `701 Failed to establish connection`.

**Where to find the values**

1. Sign up / log in at <https://dashboard.metered.ca/>.
2. Open your TURN application (create one if this is a new account). Metered
   gives it a subdomain like `auzmeet.metered.live`.
3. The app page shows a ready-made **`iceServers` snippet** — a block of
   JavaScript with the servers, a `username` and a `credential` already filled
   in. Everything you need is in that snippet:

   ```js
   // Example of what the dashboard shows you:
   iceServers: [
     { urls: "stun:stun.relay.metered.ca:80" },
     { urls: "turn:global.relay.metered.ca:80",
       username: "1a2b3c4d5e6f7a8b9c0d",          // <- METERED_TURN_USERNAME
       credential: "AbCdEfGhIjKlMnOp" },          // <- METERED_TURN_CREDENTIAL
     // …
   ]
   ```

   Copy `username` → `METERED_TURN_USERNAME`, and `credential` →
   `METERED_TURN_CREDENTIAL`. They are a pair: a generated username and its
   password, not two usernames. Neither is your account email or login
   password.

4. The **API key** is elsewhere in the dashboard, usually under Developers /
   API Keys. It is a single long string.

Also note the `urls` in that snippet. If the TURN entries use a host other than
`global.relay.metered.ca`, set `METERED_TURN_HOST` to whatever they show.

*Preferred — API key.* Credentials are minted per call and the server list comes
straight from Metered, so there is no hostname to get wrong:

```
METERED_DOMAIN  = yourapp.metered.live
METERED_API_KEY = <your api key>
```

*Or static credentials*, copied from the snippet above:

```
METERED_TURN_USERNAME   = <username from the snippet>
METERED_TURN_CREDENTIAL = <credential from the snippet>
```

Static credentials on the free tier are rotated periodically, so if calls work
for a while and then stop, that is the likely cause — switch to the API key.

The relay host defaults to `global.relay.metered.ca`. Only set
`METERED_TURN_HOST` if your dashboard shows a different one (a region-specific
relay, say). `METERED_DOMAIN` is **not** used for TURN.

**Cloudflare Calls**

```
CLOUDFLARE_TURN_KEY_ID     = <key id>
CLOUDFLARE_TURN_API_TOKEN  = <api token>
```

**Twilio**

```
TWILIO_ACCOUNT_SID = <sid>
TWILIO_AUTH_TOKEN  = <auth token>
```

**Your own coturn, or any other provider**

```
TURN_URLS       = turns:turn.example.com:443?transport=tcp,turn:turn.example.com:3478
TURN_USERNAME   = <username>
TURN_CREDENTIAL = <password>
```

### Setting them on Render

Dashboard → your service → **Environment** → *Add Environment Variable* → Save.
Render redeploys automatically. Then reload `/diagnostics`; the Relay count
should be 1 or more and the verdict should turn green.

### If /diagnostics still shows 0 relay

The **ICE errors** list on that page tells you which:

- `701 ... host lookup received error` — the hostname does not resolve. Check
  the domain for typos.
- `701 Failed to establish connection` on **every** URL while the network check
  passes — the hostname resolves and accepts connections but is not a TURN
  server. On Metered this means TURN is pointed at `<app>.metered.live` instead
  of `global.relay.metered.ca`.
- `400` / `401` — the server answered and rejected the credentials. They are
  wrong, expired, or belong to a different app.
- `701 Failed to establish connection` on a TCP/TLS URL — that port is blocked
  on the network you are testing from. Keep a `turns:…:443?transport=tcp` entry,
  since 443 is the port most likely to be allowed through.


## Automatic meeting notes (optional)

Live transcription runs **in the browser** and costs nothing: each participant
transcribes only their own microphone and the finished lines are shared with
the room over the existing socket. That gives correct speaker attribution, uses
the clean local mic rather than compressed received audio, and needs no server.

It is off by default, announced to the whole room when switched on, and pauses
while you are muted. Note that Chrome sends the microphone audio to its own
speech service for recognition — worth telling your users. It works in Chrome
and Edge; Firefox and Safari do not implement the API, and those participants
can still read what others captured.

**Notes are generated by Groq.** Set one variable on the web app:

```
GROQ_API_KEY = <key from https://console.groq.com/keys>
```

Without it, the app still produces notes — it falls back to extracting the
decisions and commitments directly from the transcript, quoting what was said
rather than summarising it. The panel says which happened.

### Model selection

Groq retires models regularly (`llama-3.1-70b-versatile`, `mixtral-8x7b-32768`
and `gemma-7b-it` are all gone), so **no model id is hardcoded**. On each run
the app reads Groq's live `/models` list, filters out non-chat models
(Whisper, TTS, guard), ranks what is left by preference, and uses the best
available. If a model is retired between calls, the request is retried on the
next candidate automatically.

To pin one anyway:

```
GROQ_MODEL = moonshotai/kimi-k2-instruct
```

A pinned model is tried first, with the discovered list still available as a
fallback — so pinning something that later disappears degrades rather than
breaks.

## Scaling note

Room state lives in memory in one process, so run **exactly one instance** of
the signaling server. Running two behind a load balancer puts participants in
different copies of the same room and they will not see each other. Going
multi-instance means adding a Socket.IO Redis adapter and sharing room state.

## Verifying a deployment

1. `https://<signaling-host>/health` returns `{"status":"ok"}`.
2. `https://<your-site>/diagnostics` reports **"Calls will work across
   networks"** with a Relay count of 1 or more.
3. Open the meeting link in two browsers — each should see the other.
4. Test with someone on a different network (mobile data is an easy check).
   If they stay on "Connecting…", go back to step 2: it is TURN.

If the banner says **"Can't reach the meeting server"**, the signaling server is
not running or is unreachable; the message names the URL it tried.
