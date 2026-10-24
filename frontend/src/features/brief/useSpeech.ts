import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from '@/lib/api/types'

/**
 * Read text aloud with the browser's own speech engine (nothing leaves the
 * phone). Marathi voices are rare on Android; when none is installed we fall
 * back to a Hindi voice, which reads Devanagari far better than an English one.
 */

const VOICE_LANG: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' }
const FALLBACK: Record<Lang, string[]> = { en: ['en-IN', 'en-GB', 'en'], hi: ['hi-IN', 'hi'], mr: ['mr-IN', 'mr', 'hi-IN', 'hi'] }

function supported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'
}

function pickVoice(lang: Lang): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  for (const want of FALLBACK[lang]) {
    const w = want.toLowerCase()
    const v = voices.find((x) => x.lang.toLowerCase().replace('_', '-') === w) ?? voices.find((x) => x.lang.toLowerCase().startsWith(w + '-'))
    if (v) return v
  }
  return undefined
}

/** Split into sentence-sized chunks: Chrome stops long utterances after ~15 s. */
function chunks(parts: string[]) {
  return parts
    .flatMap((p) => p.split(/(?<=[.!?।])\s+/))
    .map((s) => s.trim())
    .filter(Boolean)
}

export function useSpeech(lang: Lang) {
  const canSpeak = supported()
  const [speaking, setSpeaking] = useState(false)
  const run = useRef(0)

  const stop = useCallback(() => {
    run.current++
    if (canSpeak) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [canSpeak])

  const speak = useCallback(
    (parts: string[]) => {
      if (!canSpeak) return
      const synth = window.speechSynthesis
      synth.cancel()
      const id = ++run.current
      const lines = chunks(parts)
      if (!lines.length) return
      const voice = pickVoice(lang)
      lines.forEach((line, i) => {
        const u = new SpeechSynthesisUtterance(line)
        u.lang = voice?.lang ?? VOICE_LANG[lang]
        if (voice) u.voice = voice
        u.rate = 0.95
        if (i === lines.length - 1) {
          u.onend = () => run.current === id && setSpeaking(false)
        }
        u.onerror = () => run.current === id && setSpeaking(false)
        synth.speak(u)
      })
      setSpeaking(true)
    },
    [canSpeak, lang],
  )

  // voices load asynchronously on some browsers; touching the list starts that early
  useEffect(() => {
    if (canSpeak) window.speechSynthesis.getVoices()
  }, [canSpeak])

  // a new language or leaving the screen ends whatever was being read
  useEffect(() => stop, [lang, stop])

  return { supported: canSpeak, speaking, speak, stop }
}
