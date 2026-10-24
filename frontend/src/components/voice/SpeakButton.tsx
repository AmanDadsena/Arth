import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '@/components/ui'
import { useLang } from '@/i18n'
import type { Lang } from '@/lib/api/types'
import { isSpeechSupported, speak, speechKey, stopSpeaking, useSpeakingKey } from './speech'

/**
 * "Listen" pill: reads `text` aloud, tap again to stop. Renders nothing when the
 * browser has no speechSynthesis. `lang` defaults to the app language.
 * Speech it started stops when the button unmounts (e.g. leaving the page),
 * unless `stopOnUnmount={false}`.
 */
export function SpeakButton({
  text,
  lang,
  label,
  className = '',
  stopOnUnmount = true,
}: {
  text: string
  lang?: Lang
  label?: string
  className?: string
  stopOnUnmount?: boolean
}) {
  const { t } = useTranslation('voice')
  const app = useLang()
  const l = lang ?? app.lang
  const key = speechKey(text, l)
  const playing = useSpeakingKey() === key

  // stop our own speech if the button goes away mid-sentence
  const playingRef = useRef(false)
  const stopRef = useRef(stopOnUnmount)
  useEffect(() => {
    playingRef.current = playing
    stopRef.current = stopOnUnmount
  }, [playing, stopOnUnmount])
  useEffect(
    () => () => {
      if (playingRef.current && stopRef.current) stopSpeaking()
    },
    [],
  )

  if (!isSpeechSupported() || !text.trim()) return null

  const text_ = playing ? t('stopListen') : (label ?? t('listen'))
  return (
    <button
      type="button"
      aria-pressed={playing}
      onClick={() => (playing ? stopSpeaking() : speak(text, l))}
      className={`inline-flex h-11 items-center gap-2 rounded-3xl px-4 text-[16px] font-semibold transition ${
        playing ? 'bg-grow text-white' : 'bg-chip text-ink active:bg-track'
      } ${className}`}
    >
      <Icon name={playing ? 'close' : 'speaker'} size={20} />
      {text_}
    </button>
  )
}
