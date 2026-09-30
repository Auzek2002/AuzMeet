'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  ChevronUp,
  Circle,
  Disc,
  Hand,
  FileText,
  Info,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  MonitorUp,
  MoreHorizontal,
  PhoneOff,
  Square,
  Users,
  Video,
  X,
  VideoOff,
} from 'lucide-react'
import { clsx } from 'clsx'
import { DeviceOption, RecordingMode } from '@/types'
import { formatDuration } from '@/lib/recording'

export type SidePanel = 'participants' | 'chat' | 'info' | 'recordings' | 'notes' | null

interface ControlBarProps {
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  isScreenSharing: boolean
  isHandRaised: boolean
  hasAudioTrack: boolean
  hasVideoTrack: boolean
  onToggleAudio: () => void
  onToggleVideo: () => void
  onToggleScreenShare: () => void
  onToggleHand: () => void
  onLeave: () => void

  cameras: DeviceOption[]
  microphones: DeviceOption[]
  onSelectCamera: (deviceId: string) => void
  onSelectMicrophone: (deviceId: string) => void

  recordingSupported: boolean
  isRecording: boolean
  isRecordingPaused: boolean
  recordingElapsedMs: number
  recordingCount: number
  someoneIsSharing: boolean
  onStartRecording: (mode: RecordingMode) => void
  onStopRecording: () => void
  onPauseRecording: () => void
  onResumeRecording: () => void

  activePanel: SidePanel
  onTogglePanel: (panel: Exclude<SidePanel, null>) => void
  participantCount: number
  unreadCount: number
  /** True while this user is capturing a transcript. */
  isTranscribing: boolean
}

function ControlBtn({
  onClick,
  active = false,
  danger = false,
  disabled = false,
  pressed,
  title,
  badge,
  children,
}: {
  onClick: () => void
  active?: boolean
  danger?: boolean
  disabled?: boolean
  /** Reported to assistive tech for on/off controls like mute and camera. */
  pressed?: boolean
  title: string
  badge?: number
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      disabled={disabled}
      className={clsx(
        'relative p-2 sm:p-2.5 rounded-full transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent touch-manipulation',
        disabled && 'opacity-40 cursor-not-allowed',
        danger
          ? 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white'
          : active
          ? 'bg-accent text-app hover:bg-accent-hover'
          : 'bg-elevated text-primary hover:bg-avatar'
      )}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-accent-strong text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

/** Closes a popover on outside click and on Escape. */
function usePopover<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])
  return ref
}

/** A toggle button with a chevron that opens a device list. */
function DeviceControl({
  active,
  danger,
  disabled,
  pressed,
  title,
  icon,
  devices,
  onSelect,
  menuLabel,
  onToggle,
}: {
  active: boolean
  danger: boolean
  disabled: boolean
  pressed?: boolean
  title: string
  icon: React.ReactNode
  devices: DeviceOption[]
  onSelect: (deviceId: string) => void
  menuLabel: string
  onToggle: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = usePopover<HTMLDivElement>(() => setOpen(false))

  return (
    <div ref={ref} className="relative flex items-center">
      <ControlBtn
        onClick={onToggle}
        active={active}
        danger={danger}
        disabled={disabled}
        pressed={pressed}
        title={title}
      >
        {icon}
      </ControlBtn>

      {devices.length > 1 && (
        <button
          onClick={() => setOpen((value) => !value)}
          title={menuLabel}
          aria-label={menuLabel}
          className="absolute -right-0.5 -bottom-0.5 bg-elevated hover:bg-elevated-hover border border-line-strong hover:border-accent text-primary rounded-full p-[3px] shadow-md touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronUp size={9} />
        </button>
      )}

      {open && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-60 bg-surface border border-line rounded-xl shadow-2xl py-1.5 z-50">
          <p className="px-3 py-1 text-muted text-[11px] font-semibold uppercase tracking-wide">
            {menuLabel}
          </p>
          {devices.map((device) => (
            <button
              key={device.deviceId}
              onClick={() => {
                onSelect(device.deviceId)
                setOpen(false)
              }}
              className="w-full text-left px-3 py-2 text-primary text-sm hover:bg-elevated truncate transition-colors"
            >
              {device.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function RecordControl({
  supported,
  isRecording,
  isPaused,
  elapsedMs,
  someoneIsSharing,
  onStart,
  onStop,
  onPause,
  onResume,
}: {
  supported: boolean
  isRecording: boolean
  isPaused: boolean
  elapsedMs: number
  someoneIsSharing: boolean
  onStart: (mode: RecordingMode) => void
  onStop: () => void
  onPause: () => void
  onResume: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = usePopover<HTMLDivElement>(() => setOpen(false))

  const OPTIONS: { mode: RecordingMode; label: string; hint: string; icon: React.ReactNode }[] = [
    {
      mode: 'meeting',
      label: 'Record the meeting',
      hint: 'Everyone on screen plus any shared screen, with all audio mixed in',
      icon: <Users size={15} className="text-accent" />,
    },
    {
      mode: 'screen',
      label: someoneIsSharing ? 'Record the shared screen' : 'Record my screen',
      hint: someoneIsSharing
        ? 'Just the presented screen, at full quality'
        : 'Pick a screen or window to capture',
      icon: <MonitorUp size={15} className="text-emerald-400" />,
    },
    {
      mode: 'camera',
      label: 'Record just me',
      hint: 'Your camera and microphone only',
      icon: <Camera size={15} className="text-amber-400" />,
    },
  ]

  if (isRecording) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={onStop}
          title="Stop recording"
          className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full px-2.5 sm:px-3 py-2 text-xs font-semibold transition-colors touch-manipulation"
        >
          <Square size={11} fill="currentColor" />
          <span className="tabular-nums">{formatDuration(elapsedMs)}</span>
        </button>
        <ControlBtn
          onClick={isPaused ? onResume : onPause}
          title={isPaused ? 'Resume recording' : 'Pause recording'}
        >
          {isPaused ? <Circle size={18} /> : <Disc size={18} />}
        </ControlBtn>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <ControlBtn
        onClick={() => setOpen((value) => !value)}
        disabled={!supported}
        title={supported ? 'Record this meeting' : 'Recording is not supported in this browser'}
      >
        <Circle size={20} className={supported ? 'text-red-400' : undefined} />
      </ControlBtn>

      {open && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-[min(88vw,20rem)] bg-surface border border-line rounded-xl shadow-2xl p-1.5 z-50">
          <p className="px-2.5 py-1.5 text-muted text-[11px] font-semibold uppercase tracking-wide">
            Start a recording
          </p>
          {OPTIONS.map((option) => (
            <button
              key={option.mode}
              onClick={() => {
                onStart(option.mode)
                setOpen(false)
              }}
              className="w-full flex items-start gap-2.5 text-left px-2.5 py-2 rounded-lg hover:bg-elevated transition-colors"
            >
              <span className="mt-0.5 flex-shrink-0">{option.icon}</span>
              <span className="min-w-0">
                <span className="block text-primary text-sm font-medium">{option.label}</span>
                <span className="block text-muted text-xs leading-snug">{option.hint}</span>
              </span>
            </button>
          ))}
          <p className="px-2.5 pt-1.5 pb-1 text-subtle text-[11px] leading-snug border-t border-line mt-1">
            Recordings are made on this device and stay in this tab until you download them.
            Everyone in the meeting is told when you start.
          </p>
        </div>
      )}
    </div>
  )
}


/**
 * On a phone there is not room for thirteen icons, so everything past the four
 * core controls moves into a labelled sheet. Labels also make the secondary
 * actions far easier to hit and understand than a row of bare glyphs.
 */
function SheetRow({
  icon,
  label,
  hint,
  badge,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  badge?: number
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        active ? 'bg-accent/15 text-accent' : 'text-primary hover:bg-elevated'
      )}
    >
      <span className="flex-shrink-0 w-5 flex justify-center">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-muted text-xs">{hint}</span>}
      </span>
      {badge !== undefined && badge > 0 && (
        <span className="flex-shrink-0 bg-accent-strong text-white text-[11px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

function MoreSheet({
  open,
  onClose,
  isHandRaised,
  onToggleHand,
  recordingSupported,
  isRecording,
  recordingElapsedMs,
  someoneIsSharing,
  onStartRecording,
  onStopRecording,
  recordingCount,
  activePanel,
  onTogglePanel,
  participantCount,
  unreadCount,
  isTranscribing,
}: {
  open: boolean
  onClose: () => void
  isHandRaised: boolean
  onToggleHand: () => void
  recordingSupported: boolean
  isRecording: boolean
  recordingElapsedMs: number
  someoneIsSharing: boolean
  onStartRecording: (mode: RecordingMode) => void
  onStopRecording: () => void
  recordingCount: number
  activePanel: SidePanel
  onTogglePanel: (panel: Exclude<SidePanel, null>) => void
  participantCount: number
  unreadCount: number
  isTranscribing: boolean
}) {
  const [showRecordOptions, setShowRecordOptions] = useState(false)

  useEffect(() => {
    if (!open) setShowRecordOptions(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="sm:hidden fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label="More options"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 bg-surface border-t border-line rounded-t-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)] sheet-enter">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="text-muted text-xs font-semibold uppercase tracking-wide">
            More options
          </span>
          <button
            onClick={onClose}
            aria-label="Close options"
            className="text-muted hover:text-white p-1"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto pb-2">
          {showRecordOptions ? (
            <>
              {(
                [
                  ['meeting', 'Whole meeting', 'Everyone plus any shared screen'],
                  [
                    'screen',
                    someoneIsSharing ? 'Shared screen' : 'My screen',
                    'Full desktop resolution',
                  ],
                  ['camera', 'Just me', 'Your camera and microphone'],
                ] as [RecordingMode, string, string][]
              ).map(([mode, label, hint]) => (
                <SheetRow
                  key={mode}
                  icon={<Circle size={17} className="text-red-400" />}
                  label={label}
                  hint={hint}
                  onClick={() => {
                    onStartRecording(mode)
                    onClose()
                  }}
                />
              ))}
              <SheetRow
                icon={<ChevronUp size={17} className="rotate-180" />}
                label="Back"
                onClick={() => setShowRecordOptions(false)}
              />
            </>
          ) : (
            <>
              <SheetRow
                icon={<Hand size={17} />}
                label={isHandRaised ? 'Lower hand' : 'Raise hand'}
                active={isHandRaised}
                onClick={() => {
                  onToggleHand()
                  onClose()
                }}
              />
              {isRecording ? (
                <SheetRow
                  icon={<Square size={15} fill="currentColor" className="text-red-400" />}
                  label="Stop recording"
                  hint={formatDuration(recordingElapsedMs)}
                  onClick={() => {
                    onStopRecording()
                    onClose()
                  }}
                />
              ) : (
                <SheetRow
                  icon={
                    <Circle
                      size={17}
                      className={recordingSupported ? 'text-red-400' : 'text-subtle'}
                    />
                  }
                  label="Record"
                  hint={
                    recordingSupported
                      ? 'Meeting, screen or just you'
                      : 'Not supported in this browser'
                  }
                  onClick={() => {
                    if (recordingSupported) setShowRecordOptions(true)
                  }}
                />
              )}

              <div className="h-px bg-line my-1.5 mx-4" />

              <SheetRow
                icon={<Users size={17} />}
                label="Participants"
                badge={participantCount}
                active={activePanel === 'participants'}
                onClick={() => {
                  onTogglePanel('participants')
                  onClose()
                }}
              />
              <SheetRow
                icon={<MessageSquare size={17} />}
                label="Chat"
                badge={unreadCount}
                active={activePanel === 'chat'}
                onClick={() => {
                  onTogglePanel('chat')
                  onClose()
                }}
              />
              <SheetRow
                icon={<Disc size={17} />}
                label="Recordings"
                badge={recordingCount}
                active={activePanel === 'recordings'}
                onClick={() => {
                  onTogglePanel('recordings')
                  onClose()
                }}
              />
              <SheetRow
                icon={<FileText size={17} />}
                label="Meeting notes"
                hint={isTranscribing ? 'Capturing now' : 'Transcript and summary'}
                active={activePanel === 'notes'}
                onClick={() => {
                  onTogglePanel('notes')
                  onClose()
                }}
              />
              <SheetRow
                icon={<Info size={17} />}
                label="Meeting details"
                active={activePanel === 'info'}
                onClick={() => {
                  onTogglePanel('info')
                  onClose()
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function ControlBar({
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  isHandRaised,
  hasAudioTrack,
  hasVideoTrack,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleHand,
  onLeave,
  cameras,
  microphones,
  onSelectCamera,
  onSelectMicrophone,
  recordingSupported,
  isRecording,
  isRecordingPaused,
  recordingElapsedMs,
  recordingCount,
  someoneIsSharing,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
  activePanel,
  onTogglePanel,
  participantCount,
  unreadCount,
  isTranscribing,
}: ControlBarProps) {
  const canShare =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia
  const [moreOpen, setMoreOpen] = useState(false)

  // What the "More" button should badge while its contents are hidden.
  const hiddenBadge = unreadCount + recordingCount

  return (
    <div className="flex-shrink-0 bg-app border-t border-line">
      <div className="h-16 sm:h-[68px] flex items-center gap-1 px-2 sm:px-4">
        {/* Left rail: secondary panels, desktop only */}
        <div className="hidden lg:flex items-center gap-1 flex-1">
          <ControlBtn
            onClick={() => onTogglePanel('info')}
            active={activePanel === 'info'}
            title="Meeting details"
          >
            <Info size={19} />
          </ControlBtn>
          <ControlBtn
            onClick={() => onTogglePanel('recordings')}
            active={activePanel === 'recordings'}
            title="Recordings"
            badge={recordingCount}
          >
            <Disc size={19} />
          </ControlBtn>
          <ControlBtn
            onClick={() => onTogglePanel('notes')}
            active={activePanel === 'notes' || isTranscribing}
            title={isTranscribing ? 'Meeting notes (capturing)' : 'Meeting notes'}
          >
            <FileText size={19} />
          </ControlBtn>
        </div>

        {/* Centre: the controls people reach for constantly */}
        <div className="flex items-center gap-1.5 sm:gap-2 mx-auto">
          <DeviceControl
            active={!isAudioEnabled}
            danger={false}
            disabled={false}
            pressed={!isAudioEnabled}
            title={
              !hasAudioTrack
                ? 'Turn on your microphone (M)'
                : isAudioEnabled
                ? 'Mute microphone (M)'
                : 'Unmute microphone (M)'
            }
            icon={isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            devices={microphones}
            onSelect={onSelectMicrophone}
            menuLabel="Microphone"
            onToggle={onToggleAudio}
          />

          <DeviceControl
            active={!isVideoEnabled}
            danger={false}
            disabled={false}
            pressed={!isVideoEnabled}
            title={
              !hasVideoTrack
                ? 'Turn on your camera (V)'
                : isVideoEnabled
                ? 'Turn off camera (V)'
                : 'Turn on camera (V)'
            }
            icon={isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            devices={cameras}
            onSelect={onSelectCamera}
            menuLabel="Camera"
            onToggle={onToggleVideo}
          />

          <ControlBtn
            onClick={onToggleScreenShare}
            active={isScreenSharing}
            pressed={isScreenSharing}
            disabled={!canShare}
            title={
              !canShare
                ? 'Screen sharing is not available in this browser'
                : isScreenSharing
                ? 'Stop presenting (S)'
                : 'Present your screen (S)'
            }
          >
            {isScreenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
          </ControlBtn>

          {/* Raise hand and record stay in the bar from sm up */}
          <span className="hidden sm:flex items-center gap-1.5 sm:gap-2">
            <ControlBtn
              onClick={onToggleHand}
              active={isHandRaised}
              pressed={isHandRaised}
              title={isHandRaised ? 'Lower hand (H)' : 'Raise hand (H)'}
            >
              <Hand size={20} />
            </ControlBtn>

            <RecordControl
              supported={recordingSupported}
              isRecording={isRecording}
              isPaused={isRecordingPaused}
              elapsedMs={recordingElapsedMs}
              someoneIsSharing={someoneIsSharing}
              onStart={onStartRecording}
              onStop={onStopRecording}
              onPause={onPauseRecording}
              onResume={onResumeRecording}
            />
          </span>

          {/* Everything else lives in a sheet below sm */}
          <span className="sm:hidden">
            <ControlBtn
              onClick={() => setMoreOpen(true)}
              active={moreOpen}
              title="More options"
              badge={hiddenBadge}
            >
              <MoreHorizontal size={20} />
            </ControlBtn>
          </span>

          <div className="w-px h-7 bg-line mx-0.5" />

          <button
            onClick={onLeave}
            title="Leave the call"
            aria-label="Leave the call"
            className="flex items-center gap-1.5 bg-danger hover:bg-danger-hover text-white rounded-full px-3 sm:px-5 py-2.5 font-medium text-sm transition-colors touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <PhoneOff size={17} />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>

        {/* Right rail: people and chat, from sm up */}
        <div className="hidden sm:flex items-center gap-1 flex-1 justify-end">
          <span className="lg:hidden flex items-center gap-1">
            <ControlBtn
              onClick={() => onTogglePanel('info')}
              active={activePanel === 'info'}
              title="Meeting details"
            >
              <Info size={19} />
            </ControlBtn>
            <ControlBtn
              onClick={() => onTogglePanel('recordings')}
              active={activePanel === 'recordings'}
              title="Recordings"
              badge={recordingCount}
            >
              <Disc size={19} />
            </ControlBtn>
            <ControlBtn
              onClick={() => onTogglePanel('notes')}
              active={activePanel === 'notes' || isTranscribing}
              title={isTranscribing ? 'Meeting notes (capturing)' : 'Meeting notes'}
            >
              <FileText size={19} />
            </ControlBtn>
          </span>
          <ControlBtn
            onClick={() => onTogglePanel('participants')}
            active={activePanel === 'participants'}
            title="Participants (P)"
            badge={participantCount}
          >
            <Users size={19} />
          </ControlBtn>
          <ControlBtn
            onClick={() => onTogglePanel('chat')}
            active={activePanel === 'chat'}
            title="Chat (C)"
            badge={unreadCount}
          >
            <MessageSquare size={19} />
          </ControlBtn>
        </div>
      </div>

      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        isHandRaised={isHandRaised}
        onToggleHand={onToggleHand}
        recordingSupported={recordingSupported}
        isRecording={isRecording}
        recordingElapsedMs={recordingElapsedMs}
        someoneIsSharing={someoneIsSharing}
        onStartRecording={onStartRecording}
        onStopRecording={onStopRecording}
        recordingCount={recordingCount}
        activePanel={activePanel}
        onTogglePanel={onTogglePanel}
        participantCount={participantCount}
        unreadCount={unreadCount}
        isTranscribing={isTranscribing}
      />
    </div>
  )
}
