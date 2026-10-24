import { useCallback } from 'react'
import { langOfLocale, useSpeaker } from '@/components/voice'

/**
 * Read the diagnosis aloud with the phone's own voice, through the shared speech
 * engine (components/voice/speech.ts). Nothing leaves the device. `supported` is
 * false where the browser has no speech engine; the Listen button is then hidden.
 */
export function useSpeech(locale: string) {
  const { supported, speaking, speak: say, stop } = useSpeaker()
  const speak = useCallback((text: string) => say(text, langOfLocale(locale)), [say, locale])
  return { supported, speaking, speak, stop }
}
