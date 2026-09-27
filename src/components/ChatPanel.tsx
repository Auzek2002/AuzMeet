'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, X } from 'lucide-react'
import { clsx } from 'clsx'
import { ChatMessage } from '@/types'

interface ChatPanelProps {
  messages: ChatMessage[]
  onSendMessage: (message: string) => void
  onClose: () => void
  localSocketId: string
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ChatPanel({ messages, onSendMessage, onClose, localSocketId }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    onSendMessage(trimmed)
    setInput('')
  }

  return (
    <div className="w-full sm:w-80 bg-surface h-full flex flex-col sm:border-l border-line panel-enter">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-line flex-shrink-0">
        <h2 className="text-white font-medium">In-call messages</h2>
        <button
          onClick={onClose}
          className="text-muted hover:text-white p-1 rounded transition-colors"
          aria-label="Close chat"
        >
          <X size={18} />
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
        role="log"
        aria-live="polite"
        aria-label="Meeting messages"
      >
        {messages.length === 0 ? (
          <p className="text-muted text-sm text-center mt-6">
            No messages yet.
            <br />
            Say hello! 👋
          </p>
        ) : (
          messages.map((message) => {
            // Joins, leaves and recording notices are centred system notes.
            if (message.system) {
              return (
                <p
                  key={message.id}
                  className="text-muted text-[11px] text-center px-4 py-1 leading-relaxed"
                >
                  {message.message}
                </p>
              )
            }

            const isLocal = message.senderId === localSocketId
            return (
              <div
                key={message.id}
                className={clsx('flex flex-col', isLocal ? 'items-end' : 'items-start')}
              >
                <div className="flex items-center gap-2 mb-1">
                  {!isLocal && (
                    <span className="text-muted text-xs font-medium">{message.senderName}</span>
                  )}
                  <span className="text-subtle text-[11px]">{formatTime(message.timestamp)}</span>
                </div>
                <div
                  className={clsx(
                    'px-3 py-2 rounded-2xl max-w-[240px] text-sm break-words leading-relaxed whitespace-pre-wrap',
                    isLocal
                      ? 'bg-accent text-app rounded-tr-sm'
                      : 'bg-elevated text-white rounded-tl-sm'
                  )}
                >
                  {message.message}
                </div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="px-3 py-3 border-t border-line flex-shrink-0">
        <div className="flex items-end gap-2 bg-elevated rounded-2xl px-3 py-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            placeholder="Send a message…"
            rows={1}
            maxLength={2000}
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder-muted resize-none max-h-24 min-w-0"
            style={{ scrollbarWidth: 'none' }}
          />
          <button
            onClick={send}
            disabled={!input.trim()}
            aria-label="Send message"
            className="text-accent hover:text-white disabled:text-subtle transition-colors flex-shrink-0 pb-0.5"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-subtle text-[11px] mt-1.5 text-center">
          Messages are not saved after the call ends
        </p>
      </div>
    </div>
  )
}
