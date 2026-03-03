'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Send } from 'lucide-react'
import { ChatMessage } from '@/types'

interface ChatPanelProps {
  messages: ChatMessage[]
  onSendMessage: (message: string) => void
  onClose: () => void
  localSocketId: string
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ChatPanel({
  messages,
  onSendMessage,
  onClose,
  localSocketId,
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    onSendMessage(trimmed)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="w-full sm:w-72 bg-[#292a2d] h-full flex flex-col sm:border-l border-[#3c4043] panel-enter">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#3c4043]">
        <h2 className="text-white font-medium">In-call messages</h2>
        <button
          onClick={onClose}
          className="text-[#9aa0a6] hover:text-white p-1 rounded transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {messages.length === 0 ? (
          <p className="text-[#9aa0a6] text-sm text-center mt-6">
            No messages yet.
            <br />
            Say hello! 👋
          </p>
        ) : (
          messages.map((msg) => {
            const isLocal = msg.senderId === localSocketId
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isLocal ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {!isLocal && (
                    <span className="text-[#9aa0a6] text-xs font-medium">
                      {msg.senderName}
                    </span>
                  )}
                  <span className="text-[#5f6368] text-xs">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
                <div
                  className={`px-3 py-2 rounded-2xl max-w-[220px] text-sm break-words leading-relaxed ${
                    isLocal
                      ? 'bg-[#8ab4f8] text-[#202124] rounded-tr-sm'
                      : 'bg-[#3c4043] text-white rounded-tl-sm'
                  }`}
                >
                  {msg.message}
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-[#3c4043]">
        <div className="flex items-end gap-2 bg-[#3c4043] rounded-2xl px-3 py-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message…"
            rows={1}
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder-[#9aa0a6] resize-none max-h-24"
            style={{ scrollbarWidth: 'none' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="text-[#8ab4f8] hover:text-white disabled:text-[#5f6368] transition-colors flex-shrink-0 pb-0.5"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-[#5f6368] text-xs mt-1.5 text-center">
          Messages are not saved after the call ends
        </p>
      </div>
    </div>
  )
}
