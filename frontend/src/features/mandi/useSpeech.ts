import { useCallback } from 'react'
import { langOfLocale, useSpeaker } from '@/components/voice'

/**
 * Read text aloud through the shared speech engine (components/voice/speech.ts).
 * `supported` is false where the API is missing; callers hide the button then.
 */
export function useSpeech() {
  const { supported, speaking, speak: say, stop } = useSpeaker()
  const speak = useCallback((text: string, locale: string) => say(text, langOfLocale(locale)), [say])
  return { supported, speaking, speak, stop }
}
