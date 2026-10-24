import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from '@/lib/api/types'
import { isSpeechSupported, speak as speakNow, speechKey, stopSpeaking, useSpeakingKey } from './speech'

/**
 * A Listen button's state on top of the shared speech.ts: `speaking` is true
 * only while this button's own text plays, and leaving the screen stops it.
 * Every screen goes through here, so voice choice (Hindi for Marathi, no silent
 * English voice for Devanagari) is the same everywhere.
 */
export function useSpeaker() {
  const supported = isSpeechSupported()
  const [key, setKey] = useState<string | null>(null)
  const playing = useSpeakingKey()
  const speaking = key !== null && playing === key
  const mine = useRef(false)
  mine.current = speaking

  const speak = useCallback((text: string, lang: Lang) => {
    if (speakNow(text, lang)) setKey(speechKey(text, lang))
  }, [])
  const stop = useCallback(() => stopSpeaking(), [])

  useEffect(
    () => () => {
      if (mine.current) stopSpeaking()
    },
    [],
  )

  return { supported, speaking, speak, stop }
}

/** 'hi-IN' -> 'hi'; anything unknown reads as English. */
export function langOfLocale(locale: string): Lang {
  const base = locale.slice(0, 2).toLowerCase()
  return base === 'hi' || base === 'mr' ? base : 'en'
}
