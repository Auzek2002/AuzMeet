'use client'

import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { clsx } from 'clsx'
import { Toast, ToastKind } from '@/types'

interface ToastsProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

const ICONS: Record<ToastKind, React.ReactNode> = {
  info: <Info size={15} className="text-accent" />,
  success: <CheckCircle2 size={15} className="text-emerald-400" />,
  warning: <TriangleAlert size={15} className="text-amber-400" />,
  error: <AlertCircle size={15} className="text-red-400" />,
}

const BORDERS: Record<ToastKind, string> = {
  info: 'border-accent/30',
  success: 'border-emerald-400/30',
  warning: 'border-amber-400/30',
  error: 'border-red-400/30',
}

export function Toasts({ toasts, onDismiss }: ToastsProps) {
  // The container is always mounted: a live region added at the same moment as
  // its first message is often missed by screen readers.
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed top-3 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 w-[min(92vw,26rem)]"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={clsx(
            'pointer-events-auto w-full flex items-center gap-2.5 bg-surface/95 backdrop-blur border rounded-xl px-3.5 py-2.5 shadow-xl toast-enter',
            BORDERS[toast.kind]
          )}
        >
          <span className="flex-shrink-0">{ICONS[toast.kind]}</span>
          <p className="flex-1 text-primary text-sm leading-snug">{toast.message}</p>
          <button
            onClick={() => onDismiss(toast.id)}
            className="flex-shrink-0 text-muted hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
