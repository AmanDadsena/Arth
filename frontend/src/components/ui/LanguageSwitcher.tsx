import type { Lang } from '@/lib/api/types'
import { LANGS, useLang } from '@/i18n'

/** मराठी · हिंदी · English — each label in its own script. */
export function LanguageSwitcher({ onPick, tone = 'card', className = '' }: { onPick?: (l: Lang) => void; tone?: 'card' | 'glass'; className?: string }) {
  const { lang, setLang } = useLang()
  return (
    <div role="radiogroup" aria-label="Language" className={`flex gap-2 ${className}`}>
      {LANGS.map((l) => {
        const on = l.code === lang
        return (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={on}
            lang={l.code}
            onClick={() => {
              setLang(l.code)
              onPick?.(l.code)
            }}
            className={`min-h-11 rounded-2xl px-4 py-2 text-[15px] font-semibold transition ${
              on ? 'bg-ink text-white' : tone === 'glass' ? 'bg-white/55 text-ink-2 backdrop-blur-sm' : 'bg-card text-ink-2'
            }`}
          >
            {l.label}
          </button>
        )
      })}
    </div>
  )
}
