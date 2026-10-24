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

export function speak(text: string, lang: Lang): boolean {
  if (!isSpeechSupported() || !text.trim()) return false
  const synth = window.speechSynthesis
  const gen = ++generation
  synth.cancel()

  const voice = pickVoice(lang)
  const tag = voice?.lang ?? localeOf(lang)
  const parts = chunks(text)
  const key = speechKey(text, lang)

  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part)
    u.lang = tag
    if (voice) u.voice = voice
    u.rate = 0.95
    if (i === parts.length - 1) {
      u.onend = () => gen === generation && setActive(null)
    }
    u.onerror = () => gen === generation && setActive(null)
    synth.speak(u)
  })
  // Chrome sometimes starts paused after cancel()
  if (synth.paused) synth.resume()
  setActive(key)
  return true
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
