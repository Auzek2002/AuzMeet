'use client'

import {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { clsx } from 'clsx'

/**
 * Landing-page motion primitives.
 *
 * All of these are deliberately dependency-free and cheap: an
 * IntersectionObserver, a couple of CSS custom properties, and one rAF-throttled
 * pointer handler. No animation library, nothing running a timer when the page
 * is idle, and every effect degrades to "just shows the content" under
 * prefers-reduced-motion.
 */

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Releases its children once they scroll into view. Fires once. */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode
  /** Milliseconds, used to stagger siblings. */
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'li' | 'span'
}) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (prefersReducedMotion()) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setVisible(true)
        // One-shot: re-animating on every scroll past is noise, not polish.
        observer.disconnect()
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={clsx('reveal', visible && 'is-visible', className)}
      style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  )
}

/**
 * A card that lights up under the cursor. The pointer position is written to
 * CSS variables inside a rAF, so moving the mouse never triggers React work.
 */
export function SpotlightCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const frame = useRef<number>()

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const element = ref.current
    if (!element) return
    const { clientX, clientY } = event

    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined
      const rect = element.getBoundingClientRect()
      element.style.setProperty('--mx', `${clientX - rect.left}px`)
      element.style.setProperty('--my', `${clientY - rect.top}px`)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [])

  return (
    <div ref={ref} onPointerMove={onPointerMove} className={clsx('spotlight', className)}>
      {children}
    </div>
  )
}

/** Counts up to a number when it scrolls into view. */
export function CountUp({
  to,
  suffix = '',
  prefix = '',
  durationMs = 1400,
  className,
}: {
  to: number
  suffix?: string
  prefix?: string
  durationMs?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (prefersReducedMotion()) {
      setValue(to)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()

        const start = performance.now()
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / durationMs)
          // Ease-out cubic: fast first, settles gently on the final number.
          const eased = 1 - Math.pow(1 - progress, 3)
          setValue(Math.round(to * eased))
          if (progress < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.5 }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [to, durationMs])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value}
      {suffix}
    </span>
  )
}

/** A thin progress bar pinned to the top, showing scroll position. */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let frame: number | undefined

    const update = () => {
      frame = undefined
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      setProgress(scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0)
    }

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[60] h-[2px] bg-transparent pointer-events-none"
    >
      <div
        className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-rose-400 transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}

/** True once the page has scrolled past `after` pixels. */
export function useScrolled(after = 24): boolean {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    let frame: number | undefined
    const update = () => {
      frame = undefined
      setScrolled(window.scrollY > after)
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [after])

  return scrolled
}
