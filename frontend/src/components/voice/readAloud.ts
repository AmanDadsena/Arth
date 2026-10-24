import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { Lang } from '@/lib/api/types'
import { speak } from './speech'

/**
 * Voice-first answers: when "Read answers aloud" is on (the default), each new
 * AI result is spoken once as it appears, so a farmer who can't read the screen
 * still hears the dose, the diagnosis or what a letter says. Speech runs on the
 * phone's own voice (lib: speech.ts); nothing leaves the device.
 *
 * The choice is a per-device preference, like the alert switches in Profile.
 */

const KEY = 'arth.readAloud'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setReadAloud(on: boolean) {
  try {
    if (on) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, 'off')
  } catch {
    /* lasts this page load */
  }
  listeners.forEach((l) => l())
}

export function useReadAloudPref(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    read,
    () => true,
  )
}

/**
 * Speak `text` once when a new result appears (`id` changes), if the preference
 * is on. The user just tapped to get this result, so browsers allow the speech.
 */
export function useReadAloudOnce(id: string | null | undefined, text: string, lang: Lang) {
  const on = useReadAloudPref()
  const spoken = useRef<string | null>(null)
  useEffect(() => {
    if (!on || !id || !text.trim() || spoken.current === id) return
    spoken.current = id
    speak(text, lang)
  }, [on, id, text, lang])
}

/** Join spoken parts into sentences, skipping empty ones. */
export function sentences(...parts: (string | null | undefined | false)[]): string {
  return parts
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => p.trim().replace(/[.।!?:]$/, '') + '.')
    .join(' ')
}
