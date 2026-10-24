import { useCallback, useEffect, useState } from 'react'

/**
 * Read text aloud with the phone's own voice (window.speechSynthesis).
 * Nothing leaves the device. `supported` is false where the browser has no
 * speech engine — the Listen button is then hidden.
 */
export function useSpeech(locale: string) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
  const [speaking, setSpeaking] = useState(false)

  // stop talking when the screen goes away
  useEffect(() => {
    if (!supported) return
    return () => window.speechSynthesis.cancel()
  }, [supported])

  const stop = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return
      const synth = window.speechSynthesis
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = locale
      u.rate = 0.92
      const voice = pickVoice(synth.getVoices(), locale)
      if (voice) u.voice = voice
      u.onend = () => setSpeaking(false)
      u.onerror = () => setSpeaking(false)
      setSpeaking(true)
      synth.speak(u)
    },
    [supported, locale],
  )

  return { supported, speaking, speak, stop }
}

/** Exact language first; Marathi falls back to a Hindi voice (same script). */
function pickVoice(voices: SpeechSynthesisVoice[], locale: string): SpeechSynthesisVoice | undefined {
  const norm = (l: string) => l.replace('_', '-').toLowerCase()
  const want = norm(locale)
  const base = want.split('-')[0]!
  return (
    voices.find((v) => norm(v.lang) === want) ??
    voices.find((v) => norm(v.lang).startsWith(base + '-')) ??
    (base === 'mr' ? voices.find((v) => norm(v.lang).startsWith('hi')) : undefined)
  )
}
