'use client'

import { useCallback, useEffect, useState } from 'react'
import { DeviceOption, MediaDeviceSets } from '@/types'

const EMPTY: MediaDeviceSets = { cameras: [], microphones: [], speakers: [] }

function toOption(device: MediaDeviceInfo, index: number, fallback: string): DeviceOption {
  return {
    deviceId: device.deviceId,
    // Labels stay empty until permission is granted, so give them a number.
    label: device.label || `${fallback} ${index + 1}`,
  }
}

/**
 * Enumerates input/output devices and keeps the list fresh as hardware is
 * plugged in or removed.
 */
export function useMediaDevices(enabled = true): MediaDeviceSets & { refresh: () => void } {
  const [devices, setDevices] = useState<MediaDeviceSets>(EMPTY)

  const refresh = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      setDevices({
        cameras: list
          .filter((device) => device.kind === 'videoinput')
          .map((device, i) => toOption(device, i, 'Camera')),
        microphones: list
          .filter((device) => device.kind === 'audioinput')
          .map((device, i) => toOption(device, i, 'Microphone')),
        speakers: list
          .filter((device) => device.kind === 'audiooutput')
          .map((device, i) => toOption(device, i, 'Speaker')),
      })
    } catch (err) {
      console.warn('[Devices] enumeration failed:', err)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refresh()

    const handler = () => void refresh()
    navigator.mediaDevices?.addEventListener?.('devicechange', handler)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler)
  }, [enabled, refresh])

  return { ...devices, refresh }
}

/**
 * Routes audio elements to a chosen output device where the browser supports
 * setSinkId (Chromium-based browsers today).
 */
export function supportsSpeakerSelection(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype
}
