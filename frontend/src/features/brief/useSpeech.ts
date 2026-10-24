import { useCallback } from 'react'
import type { Lang } from '@/lib/api/types'
import { sentences, useSpeaker } from '@/components/voice'

/**
 * "Listen to the brief": the parts are read as sentences in the app language,
 * through the shared speech engine (components/voice/speech.ts), so Hindi and
 * Marathi get a real Hindi/Marathi voice or a clear "add a voice" hint.
 */
export function useSpeech(lang: Lang) {
  const { supported, speaking, speak: say, stop } = useSpeaker()
  const speak = useCallback((parts: string[]) => say(sentences(...parts), lang), [say, lang])
  return { supported, speaking, speak, stop }
}
