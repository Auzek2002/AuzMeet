/**
 * Screen-capture helpers.
 *
 * When someone picks "Entire Screen" the resulting track is the whole monitor:
 * every tab, window and app they switch to afterwards is part of that track,
 * with no further work from us. These helpers make that option the preferred
 * one in the picker, ask for enough resolution that the captured desktop stays
 * legible, and report back which surface was actually chosen so the UI can say
 * so plainly.
 */

export type CaptureSurface = 'monitor' | 'window' | 'browser' | 'unknown'

/**
 * Several of these members are newer than the bundled DOM typings, so the
 * options object is assembled and cast once, here, rather than at each call.
 */
interface ExtendedDisplayMediaOptions {
  video: MediaTrackConstraints & { displaySurface?: string }
  audio: boolean | MediaTrackConstraints
  /** Keep AuzMeet's own tab out of the picker — avoids a hall-of-mirrors share. */
  selfBrowserSurface?: 'include' | 'exclude'
  /** Lets the user switch to a different screen or window mid-share. */
  surfaceSwitching?: 'include' | 'exclude'
  /** Offer to capture system audio alongside the picture. */
  systemAudio?: 'include' | 'exclude'
  /** Make sure whole-monitor entries are offered at all. */
  monitorTypeSurfaces?: 'include' | 'exclude'
}

export async function requestDisplayCapture(): Promise<MediaStream> {
  const options: ExtendedDisplayMediaOptions = {
    video: {
      // A hint, not a guarantee: it puts "Entire Screen" first in the picker.
      displaySurface: 'monitor',
      frameRate: { ideal: 30, max: 60 },
      // Ask for the real desktop resolution so text survives; capped so a 5K
      // display does not produce a stream nothing can encode in time.
      width: { ideal: 1920, max: 3840 },
      height: { ideal: 1080, max: 2160 },
    },
    // System audio should reach the far end untouched — voice processing would
    // chew up music and video playback.
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
    systemAudio: 'include',
    monitorTypeSurfaces: 'include',
  }

  return navigator.mediaDevices.getDisplayMedia(options as DisplayMediaStreamOptions)
}

export function surfaceOf(track: MediaStreamTrack | null | undefined): CaptureSurface {
  if (!track) return 'unknown'
  const surface = (track.getSettings() as MediaTrackSettings & { displaySurface?: string })
    .displaySurface
  if (surface === 'monitor' || surface === 'window' || surface === 'browser') return surface
  return 'unknown'
}

/** Short label for a chip or tile badge. */
export function surfaceLabel(surface: CaptureSurface): string {
  switch (surface) {
    case 'monitor':
      return 'Entire screen'
    case 'window':
      return 'A window'
    case 'browser':
      return 'One tab'
    default:
      return 'Your screen'
  }
}

/** Sentence telling the user exactly what other people can see. */
export function surfaceDescription(surface: CaptureSurface): string {
  switch (surface) {
    case 'monitor':
      return 'Sharing your entire screen — every tab, window and app you switch to is visible to everyone.'
    case 'window':
      return 'Sharing a single window — only that window is visible, even if you switch apps.'
    case 'browser':
      return 'Sharing one browser tab — other tabs you switch to will not be shared.'
    default:
      return 'Sharing your screen.'
  }
}

/**
 * Screen content is mostly static text, where resolution matters more than
 * frame rate — except a whole monitor, where the user is likely moving between
 * apps and playing video, so smooth motion wins.
 */
export function contentHintFor(surface: CaptureSurface): 'detail' | 'motion' {
  return surface === 'monitor' ? 'motion' : 'detail'
}

/**
 * A capture track can change underneath us when the user hits Chrome's
 * "Share this tab instead". Fires the callback with the new surface.
 */
export function onSurfaceChange(
  track: MediaStreamTrack,
  callback: (surface: CaptureSurface) => void
): () => void {
  const handler = () => callback(surfaceOf(track))
  track.addEventListener('configurationchange', handler)
  return () => track.removeEventListener('configurationchange', handler)
}
