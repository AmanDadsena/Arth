import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Read text aloud with the browser's speech synthesis.
 * `supported` is false where the API is missing — callers hide the button then.
 */

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined'

/** Best voice for a locale; Marathi falls back to a Hindi voice (same script). */
function pickVoice(locale: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const norm = (l: string) => l.replace('_', '-').toLowerCase()
  const want = norm(locale)
  const base = want.split('-')[0]!
  return (
    voices.find((v) => norm(v.lang) === want) ??
    voices.find((v) => norm(v.lang).split('-')[0] === base) ??
    (base === 'mr' ? voices.find((v) => norm(v.lang).startsWith('hi')) : undefined)
  )
}

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false)
  const current = useRef<SpeechSynthesisUtterance | null>(null)

  const stop = useCallback(() => {
    if (!supported) return
    current.current = null
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  const speak = useCallback((text: string, locale: string) => {
    if (!supported || !text.trim()) return
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = locale
    const voice = pickVoice(locale)
    if (voice) u.voice = voice
    u.rate = 0.95
    // cancel() fires end/error on the previous utterance — only the current one may reset state
    const done = () => {
      if (current.current === u) {
        current.current = null
        setSpeaking(false)
      }
    }
    u.onend = done
    u.onerror = done
    current.current = u
    setSpeaking(true)
    synth.speak(u)
  }, [])

  // stop talking when the screen goes away
  useEffect(
    () => () => {
      if (supported && current.current) {
        current.current = null
        window.speechSynthesis.cancel()
      }
    },
    [],
  )

  return { supported, speaking, speak, stop }
}
