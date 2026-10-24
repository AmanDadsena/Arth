import { useSyncExternalStore } from 'react'
import { LANGS } from '@/i18n'
import type { Lang } from '@/lib/api/types'

/**
 * Text-to-speech helpers on top of the browser's speechSynthesis.
 *
 *   speak(text, lang)   – reads `text` aloud in mr-IN / hi-IN / en-IN, cancelling anything
 *                         already playing. Returns false when speech is unsupported.
 *   stopSpeaking()      – stops whatever is playing.
 *   isSpeechSupported() – false on browsers without speechSynthesis.
 *   useSpeakingKey()    – re-renders when playback starts/stops; the active key is
 *                         speechKey(text, lang) of what is playing, or null.
 *
 * Marathi voices are missing on many phones, so Marathi falls back to a Hindi voice
 * (same Devanagari script), then to whatever the browser picks for the language tag.
 */

export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

const FALLBACKS: Record<Lang, string[]> = {
  mr: ['mr-in', 'mr', 'hi-in', 'hi'],
  hi: ['hi-in', 'hi'],
  en: ['en-in', 'en-gb', 'en-us', 'en'],
}

function localeOf(lang: Lang) {
  return LANGS.find((l) => l.code === lang)?.locale ?? 'en-IN'
}

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  for (const want of FALLBACKS[lang]) {
    const exact = voices.filter((v) => v.lang.toLowerCase().replace('_', '-') === want)
    if (exact.length) return exact.find((v) => v.localService) ?? exact[0]!
    const prefix = voices.find((v) => v.lang.toLowerCase().startsWith(want + '-'))
    if (prefix) return prefix
  }
  return null
}

// Voices load asynchronously in Chrome; touching getVoices() early warms the list.
if (isSpeechSupported()) {
  try {
    window.speechSynthesis.getVoices()
  } catch {
    /* ignore */
  }
}

/** Long utterances get cut off on some engines, so speak sentence by sentence. */
function chunks(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?।॥])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    if (p.length <= 220) out.push(p)
    else for (let i = 0; i < p.length; i += 200) out.push(p.slice(i, i + 200))
  }
  return out
}

// ---- tiny store: what is playing right now -----------------------------------

let activeKey: string | null = null
let generation = 0
const listeners = new Set<() => void>()

function setActive(key: string | null) {
  if (activeKey === key) return
  activeKey = key
  for (const l of listeners) l()
}

export function speechKey(text: string, lang: Lang) {
  return `${lang}|${text}`
}

export function stopSpeaking() {
  generation++
  if (isSpeechSupported()) window.speechSynthesis.cancel()
  setActive(null)
}

/** Chrome lists voices only after they load; wait briefly the first time. */
function voicesLoaded(timeoutMs = 1500): Promise<void> {
  const synth = window.speechSynthesis
  if (synth.getVoices().length) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener('voiceschanged', done)
      resolve()
    }
    synth.addEventListener('voiceschanged', done)
    setTimeout(done, timeoutMs)
  })
}

// Kept alive until spoken: Chrome drops the end event of an utterance that was garbage-collected.
let queued: SpeechSynthesisUtterance[] = []

/**
 * Read `text` aloud. Live finding: with no Hindi or Marathi voice installed (stock
 * Windows has English only), browsers "speak" Devanagari with an English voice,
 * so nothing is heard and no error fires. Hindi and Marathi therefore need a
 * matching voice (Marathi may use a Hindi one); without it nothing is spoken and
 * useMissingVoice() reports the language so the screen can say how to add one.
 */
export function speak(text: string, lang: Lang): boolean {
  if (!isSpeechSupported() || !text.trim()) return false
  const synth = window.speechSynthesis
  const gen = ++generation
  const busy = synth.speaking || synth.pending
  synth.cancel()
  const key = speechKey(text, lang)
  setActive(key)

  const start = () => {
    if (gen !== generation) return
    const voice = pickVoice(lang)
    if (!voice && lang !== 'en') {
      setActive(null)
      setMissing(lang)
      return
    }
    setMissing(null)
    const parts = chunks(text)
    queued = parts.map((part, i) => {
      const u = new SpeechSynthesisUtterance(part)
      u.lang = voice?.lang ?? localeOf(lang)
      if (voice) u.voice = voice
      u.rate = 0.95
      if (i === parts.length - 1) {
        u.onend = () => gen === generation && setActive(null)
      }
      u.onerror = () => gen === generation && setActive(null)
      return u
    })
    queued.forEach((u) => synth.speak(u))
    // Chrome sometimes starts paused after cancel()
    if (synth.paused) synth.resume()
  }
  // Chrome silently drops speech queued in the same tick as cancel() of a running one.
  void voicesLoaded().then(() => (busy ? setTimeout(start, 80) : start()))
  return true
}

// ---- which language has no voice on this device (for the "add a voice" hint) ---

let missing: Lang | null = null
const missingListeners = new Set<() => void>()

function setMissing(lang: Lang | null) {
  if (missing === lang) return
  missing = lang
  for (const l of missingListeners) l()
}

/** The language the last speak() could not read for lack of a voice, else null. */
export function useMissingVoice(): Lang | null {
  return useSyncExternalStore(
    (cb) => {
      missingListeners.add(cb)
      return () => missingListeners.delete(cb)
    },
    () => missing,
    () => null,
  )
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
const snapshot = () => activeKey

/** The speechKey() of what is playing, or null. */
export function useSpeakingKey() {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
