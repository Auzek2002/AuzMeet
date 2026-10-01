'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  FileText,
  Minus,
  Monitor,
  Radio,
  Share2,
  Sparkles,
  Video,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Reveal, SpotlightCard } from './motion'

/* ═══════════════════════════════════════════════════════════════════════
   Interactive landing sections.

   Each one is driven by real state rather than decoration: the steps
   auto-advance and respond to touch, the feature cards run small live demos,
   and the comparison switches between providers. Everything collapses to a
   single column with full-width touch targets on a phone.
   ═══════════════════════════════════════════════════════════════════════ */

/** Pauses a timer when the tab is hidden, so nothing runs in the background. */
function useAutoAdvance(count: number, intervalMs: number, paused: boolean) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (paused || count <= 1) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs)
    return () => clearInterval(timer)
  }, [count, intervalMs, paused])

  return [index, setIndex] as const
}

/* ─────────────────────────── How it works ─────────────────────────── */

const STEPS = [
  {
    icon: <Video size={18} />,
    title: 'Start a meeting',
    body: 'One click creates a room. No sign-up, no calendar, no install.',
    visual: 'room',
  },
  {
    icon: <Share2 size={18} />,
    title: 'Share the link',
    body: 'Anyone with the link joins straight from their browser, on any device.',
    visual: 'join',
  },
  {
    icon: <Sparkles size={18} />,
    title: 'Get your notes',
    body: 'Talk. AuzMeet transcribes, then writes the summary and action items.',
    visual: 'notes',
  },
] as const

function StepVisual({ which }: { which: (typeof STEPS)[number]['visual'] }) {
  if (which === 'room') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="font-mono text-violet-300 text-sm sm:text-base bg-violet-500/10 border border-violet-400/25 rounded-lg px-4 py-2">
          auzmeet.app/<span className="text-white">kqp-83ba-mzt</span>
        </div>
        <p className="text-white/40 text-xs">Created just now</p>
      </div>
    )
  }

  if (which === 'join') {
    return (
      <div className="flex items-center justify-center h-full gap-2">
        {['A', 'M', 'J', '+'].map((letter, i) => (
          <div
            key={letter}
            className={clsx(
              'w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-sm font-semibold border',
              letter === '+'
                ? 'border-dashed border-white/25 text-white/40'
                : 'border-transparent text-white'
            )}
            style={{
              backgroundColor:
                letter === '+' ? 'transparent' : ['#a78bfa33', '#34d39933', '#fbbf2433'][i],
              color: letter === '+' ? undefined : ['#a78bfa', '#34d399', '#fbbf24'][i],
              animation: `float 3s ease-in-out ${i * 0.2}s infinite`,
            }}
          >
            {letter}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col justify-center h-full gap-2 px-1">
      {[
        { label: 'Decision', text: 'Ship on Thursday', tone: 'text-emerald-300' },
        { label: 'Action', text: 'Maria owns the migration', tone: 'text-amber-300' },
      ].map((row) => (
        <div key={row.label} className="bg-white/[0.04] rounded-lg px-3 py-2">
          <p className={clsx('text-[10px] font-semibold uppercase tracking-wide', row.tone)}>
            {row.label}
          </p>
          <p className="text-white/80 text-xs sm:text-sm">{row.text}</p>
        </div>
      ))}
    </div>
  )
}

export function HowItWorks() {
  const [paused, setPaused] = useState(false)
  const [active, setActive] = useAutoAdvance(STEPS.length, 4200, paused)

  return (
    <section className="relative px-5 sm:px-6 py-20 sm:py-28">
      <div className="relative max-w-5xl mx-auto">
        <Reveal className="text-center mb-10 sm:mb-14">
          <p className="text-violet-400 text-xs font-semibold uppercase tracking-[0.2em] mb-3">
            How it works
          </p>
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-[-0.02em]">
            Three steps, <span className="font-accent text-white/80">no setup</span>
          </h2>
        </Reveal>

        <Reveal delay={80}>
          <div
            className="grid lg:grid-cols-2 gap-5 lg:gap-8 items-center"
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
          >
            {/* Steps: tappable rows that double as progress */}
            <ol className="flex flex-col gap-2.5">
              {STEPS.map((step, i) => {
                const isActive = i === active
                return (
                  <li key={step.title}>
                    <button
                      onClick={() => {
                        setActive(i)
                        setPaused(true)
                      }}
                      aria-current={isActive}
                      className={clsx(
                        'w-full text-left flex gap-4 rounded-2xl p-4 border transition-all duration-300 min-h-[64px] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
                        isActive
                          ? 'bg-white/[0.06] border-violet-400/35'
                          : 'bg-white/[0.02] border-white/[0.07] hover:border-white/[0.14]'
                      )}
                    >
                      <span
                        className={clsx(
                          'relative flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors duration-300',
                          isActive
                            ? 'bg-violet-500/20 text-violet-200'
                            : 'bg-white/[0.04] text-white/45'
                        )}
                      >
                        {step.icon}
                        <span
                          className={clsx(
                            'absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center transition-colors duration-300',
                            isActive ? 'bg-violet-500 text-white' : 'bg-white/10 text-white/50'
                          )}
                        >
                          {i + 1}
                        </span>
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="font-display block font-semibold text-white text-base mb-0.5">
                          {step.title}
                        </span>
                        <span className="block text-white/60 text-sm leading-relaxed">
                          {step.body}
                        </span>
                      </span>
                    </button>

                    {/* Progress bar doubles as the "which step" indicator */}
                    <div className="h-0.5 mx-4 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className={clsx(
                          'h-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all duration-500',
                          isActive ? 'w-full' : 'w-0'
                        )}
                      />
                    </div>
                  </li>
                )
              })}
            </ol>

            {/* The panel the steps drive. Hidden on the smallest screens, where
                the step list alone is clearer than a shrunken diagram. */}
            <div className="hidden sm:block relative h-56 lg:h-72 rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-transparent overflow-hidden">
              <div className="absolute inset-0 grid-bg opacity-30" />
              {STEPS.map((step, i) => (
                <div
                  key={step.visual}
                  aria-hidden={i !== active}
                  className={clsx(
                    'absolute inset-0 p-6 transition-all duration-500',
                    i === active
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 translate-y-3 pointer-events-none'
                  )}
                >
                  <StepVisual which={step.visual} />
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ─────────────────────────── Feature bento ─────────────────────────── */

/** A transcript that types itself out, looping. Pure CSS would not sell it. */
function LiveTranscriptDemo() {
  const LINES = [
    { who: 'Maria', text: 'Can we ship the migration Thursday?' },
    { who: 'Alex', text: 'Yes, if the staging run is clean.' },
    { who: 'Sara', text: 'I will own the rollback plan.' },
  ]
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(LINES.length)
      return
    }
    const timer = setInterval(() => setShown((n) => (n >= LINES.length ? 0 : n + 1)), 1600)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mt-5 space-y-1.5 min-h-[86px]" aria-hidden="true">
      {LINES.map((line, i) => (
        <div
          key={line.who}
          className={clsx(
            'flex gap-2 text-xs transition-all duration-500',
            i < shown ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
          )}
        >
          <span className="text-violet-300 font-medium flex-shrink-0">{line.who}</span>
          <span className="text-white/55">{line.text}</span>
        </div>
      ))}
    </div>
  )
}

/** A small animated level meter, standing in for "recording". */
function RecordingDemo() {
  return (
    <div className="mt-5 flex items-end gap-1 h-10" aria-hidden="true">
      {[0.4, 0.75, 0.5, 1, 0.65, 0.9, 0.35, 0.8, 0.55, 0.7, 0.45].map((height, i) => (
        <span
          key={i}
          className="flex-1 rounded-full bg-gradient-to-t from-rose-500/40 to-rose-300"
          style={{
            height: `${height * 100}%`,
            animation: `float 1.6s ease-in-out ${i * 0.09}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

export function FeatureBento() {
  return (
    <section
      id="features"
      className="relative px-5 sm:px-6 py-20 sm:py-28 border-t border-white/[0.05]"
    >
      <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]" />

      <div className="relative max-w-6xl mx-auto">
        <Reveal className="text-center mb-10 sm:mb-14">
          <p className="text-violet-400 text-xs font-semibold uppercase tracking-[0.2em] mb-3">
            Features
          </p>
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-[-0.02em] mb-4">
            Everything you need
          </h2>
          <p className="text-white/60 text-sm sm:text-base max-w-xl mx-auto">
            The things other tools put behind a subscription, working out of the box.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <Reveal className="md:col-span-4">
            <SpotlightCard className="relative h-full bg-white/[0.035] border border-white/[0.08] rounded-3xl p-6 sm:p-8 overflow-hidden hover:border-white/[0.16] transition-colors duration-300">
              <div className="w-11 h-11 rounded-xl bg-violet-500/12 ring-1 ring-violet-500/25 flex items-center justify-center mb-5">
                <FileText size={20} className="text-violet-300" />
              </div>
              <h3 className="font-display font-semibold text-white text-lg sm:text-xl mb-2">
                AI meeting notes
              </h3>
              <p className="text-white/60 text-sm leading-relaxed max-w-md">
                Live transcription with speaker names, then a written summary, the decisions
                made and who owns what. Join late and ask for a catch-up brief.
              </p>
              <LiveTranscriptDemo />
            </SpotlightCard>
          </Reveal>

          <Reveal delay={90} className="md:col-span-2">
            <SpotlightCard className="relative h-full bg-white/[0.035] border border-white/[0.08] rounded-3xl p-6 sm:p-8 overflow-hidden hover:border-white/[0.16] transition-colors duration-300">
              <div className="w-11 h-11 rounded-xl bg-rose-500/12 ring-1 ring-rose-500/25 flex items-center justify-center mb-5">
                <Radio size={20} className="text-rose-300" />
              </div>
              <h3 className="font-display font-semibold text-white text-lg sm:text-xl mb-2">
                Recording
              </h3>
              <p className="text-white/60 text-sm leading-relaxed">
                Record the whole meeting or just a shared screen, in your browser. Nothing is
                uploaded. The file is yours.
              </p>
              <RecordingDemo />
            </SpotlightCard>
          </Reveal>

          <Reveal delay={60} className="md:col-span-2">
            <SpotlightCard className="relative h-full bg-white/[0.035] border border-white/[0.08] rounded-3xl p-6 sm:p-8 overflow-hidden hover:border-white/[0.16] transition-colors duration-300">
              <div className="w-11 h-11 rounded-xl bg-pink-500/12 ring-1 ring-pink-500/25 flex items-center justify-center mb-5">
                <Monitor size={20} className="text-pink-300" />
              </div>
              <h3 className="font-display font-semibold text-white text-lg sm:text-xl mb-2">
                Real screen sharing
              </h3>
              <p className="text-white/60 text-sm leading-relaxed">
                Full desktop resolution, text stays readable, and your camera keeps running
                while you present.
              </p>
            </SpotlightCard>
          </Reveal>

          <Reveal delay={120} className="md:col-span-4">
            <SpotlightCard className="relative h-full bg-white/[0.035] border border-white/[0.08] rounded-3xl p-6 sm:p-8 overflow-hidden hover:border-white/[0.16] transition-colors duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                <div className="flex-1">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/12 ring-1 ring-emerald-500/25 flex items-center justify-center mb-5">
                    <Check size={20} className="text-emerald-300" />
                  </div>
                  <h3 className="font-display font-semibold text-white text-lg sm:text-xl mb-2">
                    Private by architecture
                  </h3>
                  <p className="text-white/60 text-sm leading-relaxed">
                    Video travels directly between participants, encrypted in transit. Nothing
                    is kept once the meeting ends, because there is nowhere to keep it.
                  </p>
                </div>
                <div className="flex sm:flex-col gap-3 sm:gap-2 text-center flex-shrink-0">
                  {[
                    { value: '0', label: 'servers storing video' },
                    { value: '100%', label: 'in your browser' },
                  ].map((stat) => (
                    <div key={stat.label} className="flex-1 bg-white/[0.04] rounded-2xl px-4 py-3">
                      <div className="font-display text-2xl font-bold text-emerald-300">
                        {stat.value}
                      </div>
                      <div className="text-white/50 text-[11px] leading-tight">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </SpotlightCard>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────── Comparison ─────────────────────────── */

type Verdict = 'yes' | 'paid' | 'no'

const PROVIDERS = ['Zoom', 'Google Meet', 'Teams'] as const

const ROWS: { feature: string; others: Record<(typeof PROVIDERS)[number], Verdict> }[] = [
  { feature: 'Group video calls', others: { Zoom: 'yes', 'Google Meet': 'yes', Teams: 'yes' } },
  {
    feature: 'Screen sharing',
    others: { Zoom: 'yes', 'Google Meet': 'yes', Teams: 'yes' },
  },
  {
    feature: 'Meeting recording',
    others: { Zoom: 'paid', 'Google Meet': 'paid', Teams: 'paid' },
  },
  {
    feature: 'Live transcript',
    others: { Zoom: 'paid', 'Google Meet': 'paid', Teams: 'paid' },
  },
  {
    feature: 'AI summary and action items',
    others: { Zoom: 'paid', 'Google Meet': 'paid', Teams: 'paid' },
  },
  {
    feature: 'Catch-up brief when you join late',
    others: { Zoom: 'no', 'Google Meet': 'no', Teams: 'paid' },
  },
  {
    feature: 'No time limit on group calls',
    others: { Zoom: 'paid', 'Google Meet': 'paid', Teams: 'paid' },
  },
  {
    feature: 'Works without an account',
    others: { Zoom: 'no', 'Google Meet': 'no', Teams: 'no' },
  },
]

function VerdictMark({ verdict }: { verdict: Verdict }) {
  if (verdict === 'paid') {
    return (
      <span className="text-[10px] font-semibold text-amber-300/90 bg-amber-400/10 border border-amber-400/25 rounded-full px-2 py-0.5 whitespace-nowrap">
        PAID
      </span>
    )
  }
  if (verdict === 'no') {
    return <Minus size={14} className="text-white/30" aria-label="Not available" />
  }
  return <Check size={13} className="text-white/35" aria-label="Available" />
}

export function Comparison() {
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>('Zoom')

  const paidCount = ROWS.filter((r) => r.others[provider] === 'paid').length

  return (
    <section
      id="compare"
      className="relative px-5 sm:px-6 py-20 sm:py-28 border-t border-white/[0.05]"
    >
      <div className="relative max-w-3xl mx-auto">
        <Reveal className="text-center mb-8 sm:mb-10">
          <p className="text-violet-400 text-xs font-semibold uppercase tracking-[0.2em] mb-3">
            Compare
          </p>
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-[-0.02em] mb-4">
            Paid elsewhere.{' '}
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              Free here.
            </span>
          </h2>
          <p className="text-white/60 text-sm sm:text-base max-w-lg mx-auto">
            Pick a tool you already use and see what it charges for.
          </p>
        </Reveal>

        {/* Provider switcher: scrollable on narrow screens, never squashed */}
        <Reveal delay={60}>
          <div
            role="tablist"
            aria-label="Compare against"
            className="flex gap-2 justify-center mb-6 overflow-x-auto pb-1 -mx-5 px-5 sm:mx-0 sm:px-0"
          >
            {PROVIDERS.map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={provider === name}
                onClick={() => setProvider(name)}
                className={clsx(
                  'flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
                  provider === name
                    ? 'bg-white text-[#0a0a14]'
                    : 'bg-white/[0.06] border border-white/[0.12] text-white/70 hover:text-white hover:bg-white/[0.10]'
                )}
              >
                {name}
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal delay={120}>
          <p className="text-center text-white/55 text-sm mb-5">
            <span className="font-display text-2xl font-bold text-amber-300">{paidCount}</span>{' '}
            of {ROWS.length} of these cost money on {provider}.
          </p>

          {/* Desktop: a real table. Phone: stacked cards, because three columns
              at 360px is unreadable no matter how it is styled. */}
          <div className="hidden sm:block rounded-3xl border border-white/[0.08] overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-px bg-white/[0.06]">
              <div className="bg-[#0a0a14] px-5 py-4 text-white/50 text-xs font-semibold uppercase tracking-wide">
                Feature
              </div>
              <div className="bg-[#0a0a14] px-5 py-4 text-center">
                <span className="font-display text-sm font-semibold bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
                  AuzMeet
                </span>
              </div>
              <div className="bg-[#0a0a14] px-5 py-4 text-white/50 text-xs font-semibold uppercase tracking-wide text-center whitespace-nowrap">
                {provider}
              </div>

              {ROWS.map((row) => (
                <div key={row.feature} className="contents">
                  <div className="bg-[#09090f] px-5 py-3.5 text-white/80 text-sm">
                    {row.feature}
                  </div>
                  <div className="bg-[#09090f] px-5 py-3.5 flex items-center justify-center">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                      <Check size={13} className="text-emerald-400" />
                    </span>
                  </div>
                  <div className="bg-[#09090f] px-5 py-3.5 flex items-center justify-center">
                    <VerdictMark verdict={row.others[provider]} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <ul className="sm:hidden space-y-2">
            {ROWS.map((row) => (
              <li
                key={row.feature}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 py-3"
              >
                <p className="text-white/85 text-sm mb-2.5">{row.feature}</p>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                      <Check size={11} className="text-emerald-400" />
                    </span>
                    <span className="text-white/60">AuzMeet</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <VerdictMark verdict={row.others[provider]} />
                    <span className="text-white/60">{provider}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <p className="text-white/35 text-[11px] text-center mt-4 leading-relaxed">
            Reflects the free tiers of these tools at the time of writing. Plans change, so
            check the current terms before switching.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

/* ─────────────────────────── FAQ ─────────────────────────── */

const FAQ = [
  {
    q: 'Is it really free?',
    a: 'Yes. Calls run peer-to-peer, so there is no media server to pay for, and recordings are made in your own browser. The only paid piece is an optional relay for people behind strict firewalls.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. It runs entirely in the browser. Chrome and Edge get every feature. Firefox and Safari can join calls and share screens, but live transcription needs Chrome or Edge.',
  },
  {
    q: 'Where do recordings go?',
    a: 'Nowhere. They are composited in your browser and stay on your machine until you download them. They are never uploaded.',
  },
  {
    q: 'How many people can join?',
    a: 'Up to 16 by configuration, and it is comfortable to around six. Every participant sends video directly to every other, so the browser does more work as the room grows.',
  },
  {
    q: 'Is it private?',
    a: 'Media is encrypted in transit by WebRTC and flows directly between participants where the network allows. Nothing is stored on a server after a meeting ends.',
  },
]

export function Faq() {
  // One open at a time keeps the section from growing into a wall of text.
  const [open, setOpen] = useState<number | null>(0)

  const toggle = useCallback((index: number) => {
    setOpen((current) => (current === index ? null : index))
  }, [])

  return (
    <section className="relative px-5 sm:px-6 py-20 sm:py-28 border-t border-white/[0.05]">
      <div className="max-w-3xl mx-auto">
        <Reveal className="text-center mb-8 sm:mb-10">
          <p className="text-violet-400 text-xs font-semibold uppercase tracking-[0.2em] mb-3">
            Questions
          </p>
          <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-[-0.02em]">
            Good to know
          </h2>
        </Reveal>

        <div className="space-y-2">
          {FAQ.map((item, i) => {
            const isOpen = open === i
            return (
              <Reveal key={item.q} delay={i * 50}>
                <div
                  className={clsx(
                    'rounded-2xl border transition-colors duration-300',
                    isOpen
                      ? 'bg-white/[0.05] border-violet-400/25'
                      : 'bg-white/[0.02] border-white/[0.07] hover:border-white/[0.14]'
                  )}
                >
                  <button
                    onClick={() => toggle(i)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-4 text-left px-5 py-4 min-h-[56px] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-2xl"
                  >
                    <span className="font-display text-white text-base sm:text-lg">{item.q}</span>
                    <ChevronDown
                      size={18}
                      className={clsx(
                        'text-white/50 flex-shrink-0 transition-transform duration-300',
                        isOpen && 'rotate-180'
                      )}
                    />
                  </button>
                  <div
                    className={clsx(
                      'grid transition-all duration-300 ease-out',
                      isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="text-white/65 text-sm leading-relaxed px-5 pb-4">{item.a}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
