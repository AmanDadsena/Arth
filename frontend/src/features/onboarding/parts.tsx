import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, IconButton } from '@/components/ui'

/** Building blocks shared by every question screen. */

export function ProgressHeader({ n, total, onBack }: { n: number; total: number; onBack: () => void }) {
  const { t } = useTranslation('onboarding')
  const { t: tc } = useTranslation('common')
  const label = t('progressLabel', { n, total })
  return (
    <div className="flex items-center gap-3.5">
      <IconButton icon="back" label={tc('back')} onClick={onBack} />
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={n} aria-label={label}>
        <div className="h-full rounded-full bg-grow motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${(n / total) * 100}%` }} />
      </div>
      <div className="num min-w-[44px] flex-none text-right text-sm font-semibold text-faint" aria-hidden>
        {t('count', { n, total })}
      </div>
    </div>
  )
}

/**
 * Slides the new screen in from the side it came from and puts keyboard /
 * screen-reader focus on its heading. Nothing moves under reduced motion.
 */
export function StepTransition({ stepKey, dir, children }: { stepKey: number; dir: 1 | -1; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (first.current) {
      first.current = false
      return
    }
    // the page scrolls inside the app frame, not the window: reset every scrolled ancestor
    for (let p = el.parentElement; p; p = p.parentElement) if (p.scrollTop > 0) p.scrollTop = 0
    el.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (still || !el.animate) return
    el.animate(
      [
        { opacity: 0, transform: `translateX(${dir * 28}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 280, easing: 'cubic-bezier(.22,.7,.2,1)' },
    )
  }, [stepKey, dir])
  return (
    <div ref={ref} className="flex flex-1 flex-col">
      {children}
    </div>
  )
}

export function QuestionHead({ emoji, title, why, eyebrow }: { emoji: string; title: string; why: string; eyebrow?: string }) {
  return (
    <div className="pt-7">
      <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-card text-[30px] leading-none">
        {emoji}
      </span>
      {eyebrow ? <div className="mt-5 text-[15px] font-semibold text-grow">{eyebrow}</div> : null}
      <h1 tabIndex={-1} className={`display text-[30px] leading-[1.15] text-ink outline-none ${eyebrow ? 'mt-1' : 'mt-5'}`}>
        {title}
      </h1>
      <p className="mt-2.5 text-[16px] leading-snug text-muted">{why}</p>
    </div>
  )
}

/** A full-width answer row: big emoji (or swatch), label, optional hint, tick. */
export function OptionRow({
  on,
  multi = false,
  onClick,
  emoji,
  swatch,
  label,
  hint,
  lang,
}: {
  on: boolean
  multi?: boolean
  onClick: () => void
  emoji?: string
  swatch?: string
  label: ReactNode
  hint?: ReactNode
  lang?: string
}) {
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={on}
      lang={lang}
      onClick={onClick}
      className={`flex min-h-[68px] w-full items-center gap-3.5 rounded-[24px] px-4 py-3 text-left transition motion-safe:active:scale-[.985] ${
        on ? 'bg-grow-l text-grow-d ring-2 ring-inset ring-grow' : 'bg-card text-ink active:bg-chip'
      }`}
    >
      {swatch ? (
        <span aria-hidden className="h-11 w-11 flex-none rounded-full ring-4 ring-chip" style={{ background: swatch }} />
      ) : emoji ? (
        <span aria-hidden className={`flex h-11 w-11 flex-none items-center justify-center rounded-full text-[24px] leading-none ${on ? 'bg-card' : 'bg-chip'}`}>
          {emoji}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-semibold leading-tight">{label}</span>
        {hint ? <span className={`mt-0.5 block text-[14px] leading-snug ${on ? 'text-grow-d/80' : 'text-muted'}`}>{hint}</span> : null}
      </span>
      <Tick on={on} multi={multi} />
    </button>
  )
}

/** A square tile for grids (crops, goals): emoji on top, label below. */
export function OptionTile({ on, onClick, emoji, label }: { on: boolean; onClick: () => void; emoji: string; label: ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      className={`relative flex min-h-[108px] flex-col items-center justify-center gap-2 rounded-[24px] px-2 py-3 text-center transition motion-safe:active:scale-[.97] ${
        on ? 'bg-grow-l text-grow-d ring-2 ring-inset ring-grow' : 'bg-card text-ink active:bg-chip'
      }`}
    >
      <span aria-hidden className="text-[38px] leading-none">
        {emoji}
      </span>
      <span className="text-[17px] font-semibold leading-tight">{label}</span>
      <span className="absolute right-2.5 top-2.5">
        <Tick on={on} multi small />
      </span>
    </button>
  )
}

function Tick({ on, multi, small = false }: { on: boolean; multi: boolean; small?: boolean }) {
  const size = small ? 'h-6 w-6' : 'h-7 w-7'
  if (on)
    return (
      <span aria-hidden className={`flex flex-none items-center justify-center bg-grow text-white ${size} ${multi ? 'rounded-lg' : 'rounded-full'}`}>
        <Icon name="check" size={small ? 15 : 17} strokeWidth={2.6} />
      </span>
    )
  if (small) return null
  return <span aria-hidden className={`flex-none border-2 border-track ${size} ${multi ? 'rounded-lg' : 'rounded-full'}`} />
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 mt-6 block px-1 text-[15px] font-semibold text-ink-2">
      {children}
    </label>
  )
}

export const FIELD =
  'h-[60px] w-full rounded-[24px] bg-card px-5 text-[19px] font-medium text-ink outline-none placeholder:text-hint focus-visible:ring-2 focus-visible:ring-grow'
