'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, RefreshCw, TriangleAlert, XCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { IceDiagnostics, runIceDiagnostics } from '@/lib/iceDiagnostics'

/**
 * Answers one question: will calls work between people on different networks?
 * Open this on the deployed site to check TURN without having to arrange a
 * two-person test call.
 */
export default function DiagnosticsPage() {
  const [result, setResult] = useState<IceDiagnostics | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    setRunning(true)
    setError(null)
    try {
      setResult(await runIceDiagnostics())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The connection test could not run.')
    } finally {
      setRunning(false)
    }
  }, [])

  useEffect(() => {
    void run()
  }, [run])

  const VERDICTS = {
    ok: {
      icon: <CheckCircle2 size={22} className="text-emerald-400" />,
      title: 'Calls will work across networks',
      body: 'A TURN relay candidate was obtained, so two people behind different routers can connect.',
      tone: 'border-emerald-400/30 bg-emerald-400/10',
    },
    'turn-broken': {
      icon: <XCircle size={22} className="text-red-400" />,
      title: 'TURN is configured but not working',
      body: 'This network can reach the internet fine, but the TURN server returned no relay candidate. That usually means wrong credentials, an expired key, or a blocked port. Check the errors below.',
      tone: 'border-red-400/30 bg-red-400/10',
    },
    'udp-blocked': {
      icon: <XCircle size={22} className="text-red-400" />,
      title: 'This network is blocking the connection',
      body: 'Not even a plain STUN lookup over public servers succeeded, so the problem is this network or a VPN rather than your TURN settings. A VPN, a corporate/school firewall, or strict security software will all do this. Try again with the VPN off, or from a phone hotspot.',
      tone: 'border-red-400/30 bg-red-400/10',
    },
    'no-turn-configured': {
      icon: <TriangleAlert size={22} className="text-amber-400" />,
      title: 'No TURN server configured',
      body: 'Calls will work between people on the same network and fail between different ones. Set TURN credentials on the server, then re-run this test.',
      tone: 'border-amber-400/30 bg-amber-400/10',
    },
  } as const

  const verdict = result ? VERDICTS[result.verdict] : null

  return (
    <main className="min-h-screen bg-app text-primary px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-muted hover:text-white text-sm mb-6 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to AuzMeet
        </Link>

        <h1 className="text-2xl font-semibold mb-1">Connection test</h1>
        <p className="text-muted text-sm mb-6">
          Checks whether this deployment can relay media between people on different networks.
        </p>

        {running && !result && (
          <div className="flex items-center gap-3 text-muted text-sm">
            <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Gathering ICE candidates…
          </div>
        )}

        {error && (
          <div className="border border-red-400/30 bg-red-400/10 rounded-xl p-4 text-red-200 text-sm">
            {error}
          </div>
        )}

        {result && verdict && (
          <>
            <div className={clsx('border rounded-xl p-4 flex gap-3 mb-6', verdict.tone)}>
              <span className="flex-shrink-0 mt-0.5">{verdict.icon}</span>
              <div>
                <h2 className="font-semibold mb-1">{verdict.title}</h2>
                <p className="text-sm text-muted leading-relaxed">{verdict.body}</p>
              </div>
            </div>

            <section className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                Candidates gathered
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['host', 'Host', 'same network'],
                    ['srflx', 'Server reflexive', 'via STUN'],
                    ['relay', 'Relay', 'via TURN'],
                  ] as const
                ).map(([key, label, hint]) => (
                  <div
                    key={key}
                    className={clsx(
                      'rounded-xl p-3 border',
                      key === 'relay' && result.counts.relay === 0
                        ? 'border-red-400/40 bg-red-400/10'
                        : 'border-line bg-elevated'
                    )}
                  >
                    <div className="text-2xl font-bold tabular-nums">{result.counts[key]}</div>
                    <div className="text-xs font-medium">{label}</div>
                    <div className="text-[11px] text-muted">{hint}</div>
                  </div>
                ))}
              </div>
              {result.relayProtocols.length > 0 && (
                <p className="text-xs text-muted mt-2">
                  Relay protocols: {result.relayProtocols.join(', ')}
                </p>
              )}
              <p
                className={clsx(
                  'text-xs mt-2',
                  result.baselineSrflx === 0 ? 'text-red-300' : 'text-muted'
                )}
              >
                Network check (public STUN, ignoring your settings):{' '}
                {result.baselineSrflx === 0
                  ? 'no candidates, so this network is blocking UDP, or a VPN is in the way'
                  : `${result.baselineSrflx} candidate(s), so basic connectivity is fine`}
              </p>
            </section>

            <section className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                Provider
              </h3>
              <div className="bg-elevated border border-line rounded-xl p-3 text-sm">
                <p>
                  <span className="text-muted">Configured provider:</span>{' '}
                  <span className="font-mono">{result.provider}</span>
                </p>
                {result.warning && <p className="text-amber-300 text-xs mt-2">{result.warning}</p>}
                <ul className="mt-2 space-y-0.5">
                  {result.iceServers.map((server, index) => (
                    <li key={index} className="text-xs font-mono text-muted break-all">
                      {Array.isArray(server.urls) ? server.urls.join(', ') : server.urls}
                      {server.hasCredentials && (
                        <span className="text-emerald-400/80"> (with credentials)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {result.errors.length > 0 && (
              <section className="mb-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                  ICE errors
                </h3>
                <ul className="bg-elevated border border-line rounded-xl p-3 space-y-1">
                  {result.errors.map((err, index) => (
                    <li key={index} className="text-xs font-mono text-red-300 break-all">
                      {err.code} {err.text} {err.url && `@ ${err.url}`}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted mt-2 leading-relaxed">
                  701 means the server could not be reached at all: a blocked port, or no route
                  from this network. 400 or 401 mean it answered and rejected the credentials.
                  &ldquo;Address not associated with the desired network interface&rdquo; almost
                  always means a VPN or virtual adapter is intercepting the traffic.
                </p>
              </section>
            )}

            <button
              onClick={() => void run()}
              disabled={running}
              className="inline-flex items-center gap-2 bg-accent-strong hover:bg-accent-strong-hover disabled:opacity-50 text-white text-sm font-semibold rounded-full px-4 py-2 transition-colors"
            >
              <RefreshCw size={14} className={running ? 'animate-spin' : undefined} />
              {running ? 'Testing…' : 'Run again'}
            </button>
            <p className="text-[11px] text-muted mt-3">Completed in {result.durationMs} ms.</p>
          </>
        )}
      </div>
    </main>
  )
}
