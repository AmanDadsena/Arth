import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BottomSheet, Icon, type IconName } from '@/components/ui'
import { useLang } from '@/i18n'
import { useAuth } from './useAuth'

/**
 * The one redesigned screen. Dawn over the Nashik hills: the sun rises behind
 * three layers of fields while the wordmark settles and the tagline cycles
 * through Marathi, Hindi and English. Everything is static under
 * prefers-reduced-motion. Rutu's palette and type throughout.
 */

const TAGLINE_LANG = ['en', 'hi', 'mr'] as const
const CYCLE_MS = 3200

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

function Dawn() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* sky: cream at the top, saffron at the horizon */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #F4EEDF 0%, #F6E4C2 40%, #F3CB93 72%, #EDB878 100%)' }} />

      {/* the sun, rising behind the far hills */}
      <div className="absolute bottom-[26%] left-[58%] -translate-x-1/2">
        <div className="dawn-sun relative">
          <div
            className="dawn-glow absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(255,214,140,.75) 0%, rgba(246,186,110,.25) 45%, transparent 70%)' }}
          />
          <div className="relative h-[104px] w-[104px] rounded-full" style={{ background: 'radial-gradient(circle at 50% 40%, #FFE8B0 0%, #F8C266 55%, #EE9F45 100%)' }} />
        </div>
      </div>

      {/* three layers of hills, furrows on the nearest, then the ground in Rutu's screen colour */}
      <svg className="absolute inset-x-0 -bottom-[2px] h-[44%] min-h-[150px] w-full" viewBox="0 0 400 200" preserveAspectRatio="none">
        <g className="dawn-far">
          <path d="M-20 70 C 40 34, 90 44, 140 60 S 240 22, 300 48 S 390 36, 440 56 L 440 200 L -20 200 Z" fill="#B7C7A4" />
        </g>
        <path d="M-20 104 C 50 72, 110 82, 170 100 S 280 66, 340 88 S 410 82, 440 94 L 440 200 L -20 200 Z" fill="#7FA277" />
        <path d="M-20 140 C 60 110, 140 118, 210 134 S 330 112, 440 128 L 440 200 L -20 200 Z" fill="#2E6B3F" />
        <g stroke="#245231" strokeWidth="1.2" fill="none" opacity=".6">
          <path d="M0 160 C 80 142, 160 146, 230 156 S 350 144, 400 150" />
          <path d="M0 172 C 90 156, 170 160, 240 168 S 350 158, 400 162" />
        </g>
        <path d="M-20 186 C 100 170, 300 170, 420 186 L 420 200 L -20 200 Z" fill="#E9E5DA" />
      </svg>
    </div>
  )
}

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function Tagline() {
  const { t } = useTranslation('login')
  const { lang } = useLang()
  const reduced = useReducedMotion()
  const lines = t('taglines', { returnObjects: true }) as string[]
  const [i, setI] = useState(0)
  const [shown, setShown] = useState(true)

  useEffect(() => {
    if (reduced) return
    let swap: ReturnType<typeof setTimeout>
    const id = setInterval(() => {
      setShown(false)
      swap = setTimeout(() => {
        setI((n) => (n + 1) % lines.length)
        setShown(true)
      }, 600)
    }, CYCLE_MS)
    return () => {
      clearInterval(id)
      clearTimeout(swap)
    }
  }, [reduced, lines.length])

  const idx = reduced ? Math.max(0, TAGLINE_LANG.indexOf(lang)) : i
  return (
    <p
      aria-live="off"
      lang={TAGLINE_LANG[idx]}
      className={`tagline display mt-4 min-h-[66px] max-w-[300px] text-[23px] leading-snug text-ink-2 ${shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`}
    >
      {lines[idx]}
    </p>
  )
}

function TrustChip({ icon, children }: { icon: IconName; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-2xl bg-card/80 px-3 py-1.5 text-[13px] font-semibold text-ink-2">
      <Icon name={icon} size={15} className="text-grow" />
      {children}
    </span>
  )
}

function PrivacyNotice({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('login')
  const Section = ({ title, icon, tone, items }: { title: string; icon: IconName; tone: string; items: string[] }) => (
    <div className="rounded-[24px] bg-card px-4 py-4">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full ${tone}`}>
          <Icon name={icon} size={18} />
        </span>
        <div className="text-[17px] font-semibold text-ink">{title}</div>
      </div>
      <ul className="mt-2.5 space-y-2 pl-1">
        {items.map((s) => (
          <li key={s} className="flex gap-2.5 text-[15px] leading-snug text-ink-2">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-faint" />
            {s}
          </li>
        ))}
      </ul>
    </div>
  )
  return (
    <BottomSheet open={open} onClose={onClose} title={t('privacyTitle')}>
      <div className="space-y-3">
        <Section title={t('privacyWeStore')} icon="lock" tone="bg-grow-l text-grow" items={[t('privacyStore1'), t('privacyStore2')]} />
        <Section title={t('privacyNever')} icon="shield" tone="bg-warn-l text-warn" items={[t('privacyNever1'), t('privacyNever2')]} />
        <Section title={t('privacyControl')} icon="trash" tone="bg-chip text-ink-2" items={[t('privacyControl1'), t('privacyControl2')]} />
      </div>
    </BottomSheet>
  )
}

export default function LoginPage() {
  const { t } = useTranslation('login')
  const { status, canSignIn, signInWithGoogle, startDemo } = useAuth()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [privacyOpen, setPrivacyOpen] = useState(false)

  if (status === 'demo' || status === 'signedIn') return <Navigate to="/" replace />

  async function google() {
    if (!canSignIn) {
      setNote(t('noSignIn'))
      return
    }
    setBusy(true)
    setNote(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      // Dev builds show Firebase's error code (e.g. auth/popup-blocked): it says what to fix, holds no personal data.
      const code = (err as { code?: string }).code
      setNote(import.meta.env.DEV && code ? `${t('failed')} (${code})` : t('failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sc flex h-full flex-col overflow-y-auto overflow-x-hidden bg-screen">
      {/* sky: wordmark + tagline over the dawn */}
      <section className="relative min-h-[330px] flex-1 px-7 pt-[max(40px,env(safe-area-inset-top))]">
        <Dawn />
        <div className="relative">
        <div className="dawn-mark">
          <h1 className="display text-[76px] leading-[.95] text-ink">{t('common:brand')}</h1>
          <div className="display -mt-1 text-[38px] leading-none text-ink-2" lang="hi">
            {t('common:brandDeva')}
          </div>
        </div>
        <div className="dawn-up-1 mt-5 h-1 w-14 rounded-sm bg-grow" />
        <div className="dawn-up-1">
          <Tagline />
        </div>
        </div>
      </section>

      {/* ground: actions */}
      <section className="px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-1">
        <div className="dawn-up-2 space-y-2.5">
          <button
            type="button"
            onClick={() => void google()}
            disabled={busy}
            className="flex h-[58px] w-full items-center justify-center gap-3 rounded-[30px] border border-[#dadce0] bg-white text-[17px] font-semibold text-[#1f1f1f] shadow-[0_1px_2px_rgba(60,64,67,.15)] active:bg-[#f8f9fa]"
          >
            {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#4285F4] border-t-transparent" /> : <GoogleG />}
            {busy ? t('signingIn') : t('google')}
          </button>
          {note ? (
            <p role="status" className="px-2 text-center text-[14px] font-medium text-warn-d">
              {note}
            </p>
          ) : null}
          <button
            type="button"
            onClick={startDemo}
            className="flex h-[54px] w-full items-center justify-center gap-2 rounded-[28px] bg-grow text-[17px] font-semibold text-white active:brightness-90"
          >
            <Icon name="sprout" size={20} />
            {t('demo')}
          </button>
        </div>

        <div className="dawn-up-3 mt-5 flex flex-wrap justify-center gap-2">
          <TrustChip icon="lock">{t('trustPhotos')}</TrustChip>
          <TrustChip icon="trash">{t('trustDelete')}</TrustChip>
          <TrustChip icon="pin">{t('trustMade')}</TrustChip>
        </div>

        <button type="button" onClick={() => setPrivacyOpen(true)} className="mx-auto mt-3 block min-h-11 px-3 text-[14px] font-semibold text-muted underline underline-offset-4">
          {t('privacy')}
        </button>
      </section>

      <PrivacyNotice open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  )
}
