import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AiTag, BottomSheet, Button, EscalateCard, Icon } from '@/components/ui'
import { useLang } from '@/i18n'
import { SpeakButton } from './SpeakButton'
import { speak, stopSpeaking } from './speech'
import { isVoiceSupported, MAX_RECORDING_MS, useVoice } from './useVoice'

/** '/' → 'home', '/mandi' → 'mandi', '/doctor/x' → 'doctor' */
export function screenFromPath(pathname: string) {
  const seg = pathname.split('/').filter(Boolean)[0]
  return seg || 'home'
}

/** Only follow in-app routes like '/mandi' — never another origin. */
function safeRoute(to: string | null | undefined): string | null {
  if (!to || typeof to !== 'string') return null
  if (!to.startsWith('/') || to.startsWith('//') || to.includes('\\')) return null
  return to
}

const NAV_DELAY_MS = 1800
const MAX_S = Math.round(MAX_RECORDING_MS / 1000)

function RecordingTimer() {
  const { t } = useTranslation('voice')
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(startedAt)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  const s = Math.min(MAX_S, Math.floor((now - startedAt) / 1000))
  const pct = Math.min(100, ((now - startedAt) / MAX_RECORDING_MS) * 100)
  return (
    <div className="w-full">
      <div className="num text-center text-[15px] font-semibold text-ink-2" aria-label={t('seconds', { s, max: MAX_S })}>
        0:{String(s).padStart(2, '0')} <span className="text-faint">/ 0:{MAX_S}</span>
      </div>
      <div aria-hidden className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-track">
        <div className="h-full rounded-full bg-grow transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/**
 * Floating voice button. Tap to talk, tap again (or the big button in the sheet) to stop;
 * the answer is shown and read aloud, and the app opens the page it points to.
 * Renders nothing when the browser cannot record. Position it with `className`.
 */
export function MicButton({ className = '' }: { className?: string }) {
  const { t } = useTranslation('voice')
  const { lang } = useLang()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const screen = screenFromPath(pathname)
  const { state, start, stop, result, error, reset } = useVoice({ screen })
  const [open, setOpen] = useState(false)
  const [supported] = useState(isVoiceSupported)

  const close = useCallback(() => {
    setOpen(false)
    stopSpeaking()
    reset()
  }, [reset])

  // read the answer aloud as soon as it arrives
  useEffect(() => {
    if (result?.reply) speak(result.reply, lang)
    // only when a new result arrives, not on language change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  const route = result && !result.escalate ? safeRoute(result.navigateTo) : null
  const goingSomewhere = route !== null && route !== pathname

  // then open the page it points to, after a short moment
  useEffect(() => {
    if (!goingSomewhere || !route) return
    const id = setTimeout(() => {
      setOpen(false)
      reset() // keep speaking: the reply continues over the new page
      navigate(route)
    }, NAV_DELAY_MS)
    return () => clearTimeout(id)
  }, [goingSomewhere, route, navigate, reset])

  if (!supported) return null

  const onFab = () => {
    if (state === 'recording') {
      stop()
      return
    }
    setOpen(true)
    if (state !== 'processing') {
      stopSpeaking()
      start()
    }
  }

  const recording = state === 'recording'
  const processing = state === 'processing'
  const fabLabel = recording ? t('micStop') : processing ? t('micBusy') : t('micLabel')

  const title =
    state === 'recording' || (state === 'idle' && !result)
      ? t('titleListening')
      : processing
        ? t('titleThinking')
        : state === 'error' || state === 'denied'
          ? t('titleProblem')
          : t('titleAnswer')

  return (
    <>
      <button
        type="button"
        onClick={onFab}
        aria-label={fabLabel}
        aria-pressed={recording}
        className={`flex h-16 w-16 flex-none items-center justify-center rounded-full text-white shadow-[0_10px_24px_rgba(23,21,15,.28)] transition active:scale-95 ${
          recording ? 'arth-pulse bg-warn' : processing ? 'bg-grow' : 'bg-ink'
        } ${className}`}
      >
        {processing ? (
          <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
        ) : (
          <Icon name="mic" size={28} />
        )}
      </button>

      <BottomSheet open={open} onClose={close} title={title}>
        <div role="status" aria-live="polite" className="pb-1">
          {state === 'idle' && !result ? (
            <div className="flex flex-col items-center py-6 text-center">
              <span aria-hidden className="h-8 w-8 animate-spin rounded-full border-[3px] border-grow border-t-transparent" />
              <p className="mt-4 text-[16px] text-muted">{t('starting')}</p>
            </div>
          ) : null}

          {recording ? (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <p className="text-[17px] leading-snug text-ink-2">{t('speakNow')}</p>
              <button
                type="button"
                onClick={stop}
                aria-label={t('micStop')}
                className="arth-pulse mt-1 flex h-24 w-24 items-center justify-center rounded-full bg-warn text-white active:scale-95"
              >
                <span aria-hidden className="h-8 w-8 rounded-lg bg-white" />
              </button>
              <div className="text-[15px] font-medium text-muted">{t('tapToStop')}</div>
              <RecordingTimer />
            </div>
          ) : null}

          {processing ? (
            <div className="flex flex-col items-center py-6 text-center">
              <span aria-hidden className="h-10 w-10 animate-spin rounded-full border-[3px] border-grow border-t-transparent" />
              <p className="mt-4 text-[17px] text-ink-2">{t('thinking')}</p>
            </div>
          ) : null}

          {state === 'idle' && result ? (
            <div>
              {result.transcript ? (
                <div className="rounded-[22px] bg-chip px-4 py-3">
                  <div className="text-[13px] font-semibold uppercase tracking-wide text-faint">{t('youSaid')}</div>
                  <q className="mt-1 block text-[16px] italic leading-snug text-muted">{result.transcript}</q>
                </div>
              ) : null}
              <p className="display mt-4 text-[24px] leading-snug text-ink">{result.reply}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <SpeakButton text={result.reply} lang={lang} stopOnUnmount={false} />
                {goingSomewhere ? (
                  <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-grow">
                    <Icon name="chevron" size={18} />
                    {t('opening')}
                  </span>
                ) : null}
              </div>
              {result.escalate ? (
                <div className="mt-4">
                  <EscalateCard />
                </div>
              ) : null}
              {!goingSomewhere ? (
                <Button icon="mic" variant="dark" className="mt-5" onClick={() => {
                    stopSpeaking()
                    start()
                  }}>
                  {t('askAgain')}
                </Button>
              ) : null}
              <AiTag model={result.model} />
            </div>
          ) : null}

          {state === 'error' ? (
            <div className="py-2 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warn-l text-warn">
                <Icon name="alert" />
              </span>
              <p className="mt-3 text-[17px] leading-snug text-ink-2">{error}</p>
              <Button icon="retry" className="mt-5" onClick={start}>
                {t('tryAgain')}
              </Button>
            </div>
          ) : null}

          {state === 'denied' ? (
            <div className="py-1">
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-warn-l text-warn">
                  <Icon name="lock" />
                </span>
                <div>
                  <div className="text-[18px] font-semibold text-ink">{t('deniedTitle')}</div>
                  <p className="mt-1 text-[15px] leading-snug text-muted">{error}</p>
                </div>
              </div>
              <ol className="mt-4 list-decimal space-y-2 rounded-[22px] bg-card py-4 pl-9 pr-4 text-[15px] leading-snug text-ink-2">
                <li>{t('step1')}</li>
                <li>{t('step2')}</li>
                <li>{t('step3')}</li>
              </ol>
              <p className="mt-3 text-[15px] text-muted">{t('thenRetry')}</p>
              <Button icon="retry" className="mt-4" onClick={start}>
                {t('tryAgain')}
              </Button>
            </div>
          ) : null}
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[12px] text-faint">
          <Icon name="lock" size={13} />
          {t('privacy')}
        </p>
      </BottomSheet>
    </>
  )
}
