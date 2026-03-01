'use client'

import { useState } from 'react'
import { X, Copy, Check, Link2 } from 'lucide-react'

interface InfoPanelProps {
  roomId: string
  onClose: () => void
}

export function InfoPanel({ roomId, onClose }: InfoPanelProps) {
  const [copied, setCopied] = useState(false)

  const meetingLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/meeting/${roomId}`
      : `/meeting/${roomId}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(meetingLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea')
      el.value = meetingLink
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <div className="w-72 bg-[#292a2d] h-full flex flex-col border-l border-[#3c4043] panel-enter">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#3c4043]">
        <h2 className="text-white font-medium">Meeting details</h2>
        <button
          onClick={onClose}
          className="text-[#9aa0a6] hover:text-white p-1 rounded transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-4 py-5 space-y-5">
        {/* Meeting link */}
        <div>
          <p className="text-[#9aa0a6] text-xs font-medium mb-2 uppercase tracking-wider">
            Joining info
          </p>
          <div className="flex items-center gap-2 bg-[#3c4043] rounded-xl px-3 py-3">
            <Link2 size={14} className="text-[#9aa0a6] flex-shrink-0" />
            <span className="text-[#8ab4f8] text-xs flex-1 truncate font-mono">
              {meetingLink}
            </span>
          </div>
        </div>

        {/* Meeting code */}
        <div>
          <p className="text-[#9aa0a6] text-xs font-medium mb-2 uppercase tracking-wider">
            Meeting code
          </p>
          <div className="bg-[#3c4043] rounded-xl px-3 py-3">
            <span className="text-white text-sm font-mono tracking-widest">
              {roomId}
            </span>
          </div>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-full px-4 py-2.5 text-sm font-medium transition-colors"
        >
          {copied ? (
            <>
              <Check size={14} />
              Copied!
            </>
          ) : (
            <>
              <Copy size={14} />
              Copy joining info
            </>
          )}
        </button>

        <p className="text-[#9aa0a6] text-xs text-center leading-relaxed">
          Share this link or code with people you want in the meeting.
          <br />
          Only people you invite can join.
        </p>
      </div>
    </div>
  )
}
