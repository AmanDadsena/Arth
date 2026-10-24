import { useRef, type KeyboardEvent } from 'react'
import type { Lang } from '@/lib/api/types'
import { LANGS, useLang } from '@/i18n'

/** The letter on each option's tile, in its own script. */
const GLYPH: Record<Lang, string> = { mr: 'म', hi: 'हि', en: 'En' }

type Size = 'sm' | 'md' | 'lg'

const SIZES: Record<Size, { box: string; thumb: string; tile: string; tileText: string; tileEn: string; name: string; check: string; opt: string }> = {
  // one line: tile + name, for tight corners (headers)
  sm: { box: 'rounded-[20px]', thumb: 'rounded-[16px]', tileEn: 'text-[10.5px]', opt: 'min-h-12 min-w-0 flex-row gap-1.5 px-2', tile: 'h-6 w-6 rounded-lg', tileText: 'text-[13px]', name: 'text-[15px]', check: 'h-4 w-4 -right-0.5 -top-0.5' },
  // stacked: tile over name — the default, fits from ~250 px up
  md: { box: 'rounded-[24px]', thumb: 'rounded-[20px]', tileEn: 'text-[13px]', opt: 'min-h-[76px] min-w-[78px] flex-col gap-1 px-1.5 py-2', tile: 'h-8 w-8 rounded-[11px]', tileText: 'text-[17px]', name: 'text-[16px]', check: 'h-5 w-5 right-1.5 top-1.5' },
  // the onboarding language step
  lg: { box: 'rounded-[28px]', thumb: 'rounded-[24px]', tileEn: 'text-[17px]', opt: 'min-h-[104px] min-w-[92px] flex-col gap-2 px-2 py-3', tile: 'h-11 w-11 rounded-[14px]', tileText: 'text-[23px]', name: 'text-[19px]', check: 'h-6 w-6 right-2 top-2' },
}

/**
 * मराठी · हिंदी · English — a segmented control, each option in its own script
 * with a letter tile. A white thumb slides to the chosen one and a green tick
 * pops in. Arrow keys move the choice (roving tabindex, radiogroup semantics).
 * `tone="glass"` sits on the login sky; `size` picks the layout.
 */
export function LanguageSwitcher({
  onPick,
  tone = 'card',
  size = 'md',
  className = '',
}: {
  onPick?: (l: Lang) => void
  tone?: 'card' | 'glass'
  size?: Size
  className?: string
}) {
  const { lang, setLang } = useLang()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = Math.max(0, LANGS.findIndex((l) => l.code === lang))
  const s = SIZES[size]

  const pick = (code: Lang) => {
    if (code !== lang) setLang(code)
    onPick?.(code)
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (index + step + LANGS.length) % LANGS.length
    pick(LANGS[next]!.code)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label="Language · भाषा"
      onKeyDown={onKey}
      className={`relative grid grid-cols-3 p-1 ${s.box} ${
        tone === 'glass'
          ? 'bg-white/40 shadow-[inset_0_0_0_1px_rgba(255,255,255,.55)] backdrop-blur-md'
          : 'bg-chip shadow-[inset_0_1px_2px_rgba(23,21,15,.07)]'
      } ${className}`}
    >
      <span
        aria-hidden
        className={`arth-lang-thumb bg-card shadow-[0_6px_16px_-6px_rgba(23,21,15,.30),0_1px_2px_rgba(23,21,15,.08),inset_0_0_0_1.5px_rgba(46,107,63,.55)] ${s.thumb}`}
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {LANGS.map((l, i) => {
        const on = i === index
        return (
          <button
            key={l.code}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            lang={l.code}
            onClick={() => pick(l.code)}
            className={`relative z-[1] flex items-center justify-center rounded-[18px] transition-colors duration-300 active:scale-[.97] ${s.opt}`}
          >
            <span
              aria-hidden
              className={`flex flex-none items-center justify-center leading-none transition-colors duration-300 ${s.tile} ${
                on ? 'bg-grow text-white' : tone === 'glass' ? 'bg-white/70 text-ink-2' : 'bg-card text-ink-2'
              } ${l.code === 'en' ? `num font-semibold ${s.tileEn}` : `display pt-[0.12em] ${s.tileText}`}`}
            >
              {GLYPH[l.code]}
            </span>
            <span className={`max-w-full truncate font-semibold leading-tight transition-colors duration-300 ${s.name} ${on ? 'text-ink' : 'text-muted'}`}>
              {l.label}
            </span>
            {on ? (
              <span aria-hidden className={`arth-lang-check absolute flex items-center justify-center rounded-full bg-grow text-white ${s.check}`}>
                <svg viewBox="0 0 24 24" width="70%" height="70%" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
