import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, Icon } from '@/components/ui'
import { LANGS, useLang } from '@/i18n'
import { CROPS, DEFAULTS, QUESTIONS, districtLabel, isAnswered, type Draft, type QuestionId } from './model'
import { Glyph, type GlyphName } from './glyphs'

/**
 * Everything the farmer said, as rows. Tapping a row jumps back to that question.
 * Soil is not a question: the summary says it is read from the district.
 */

const GROUPS: { id: 'you' | 'farm'; rows: QuestionId[] }[] = [
  { id: 'you', rows: ['lang', 'name', 'where'] },
  { id: 'farm', rows: ['crops', 'land', 'water'] },
]

const glyphOf = (id: QuestionId) => QUESTIONS.find((q) => q.id === id)!.glyph
const glyphFor = (opts: { value: string; glyph: GlyphName }[], v: string | undefined) => opts.find((o) => o.value === v)?.glyph

export function Review({ draft, onJump, editing }: { draft: Draft; onJump: (id: QuestionId) => void; editing: boolean }) {
  const { t } = useTranslation('onboarding')
  const { t: tc } = useTranslation('common')
  const { lang } = useLang()

  function value(id: QuestionId): { text: ReactNode; glyph?: GlyphName; tone?: 'needed' | 'quiet' } {
    const answered = isAnswered(id, draft)
    switch (id) {
      case 'lang':
        return { text: <span lang={lang}>{LANGS.find((l) => l.code === lang)!.label}</span> }
      case 'name':
        return answered ? { text: draft.name.trim() } : { text: t('review.needed'), tone: 'needed' }
      case 'where':
        return answered ? { text: `${draft.village.trim()}, ${districtLabel(draft.district, lang)}` } : { text: t('review.needed'), tone: 'needed' }
      case 'crops':
        return answered ? { text: draft.crops.map((c) => tc(`crops.${c}`)).join(', '), glyph: glyphFor(CROPS, draft.crops[0]) } : { text: t('review.needed'), tone: 'needed' }
      case 'land':
        return answered
          ? {
              text: (
                <>
                  <span className="num">{draft.landAcres}</span> {tc('units.acres')}
                </>
              ),
            }
          : { text: t('review.needed'), tone: 'needed' }
      case 'water':
        return draft.irrigation ? { text: tc(`irrigation.${draft.irrigation}`) } : assumed(tc(`irrigation.${DEFAULTS.irrigation}`))
    }
  }

  function assumed(v: string) {
    return { text: t('review.assumed', { value: v }), tone: 'quiet' as const }
  }

  return (
    <div className="pt-7">
      <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-grow text-white">
        <Glyph name={editing ? 'edit' : 'sunrise'} size={28} />
      </span>
      <h1 tabIndex={-1} className="display mt-5 text-[30px] leading-[1.15] text-ink outline-none">
        {editing ? t('review.editTitle') : t('review.title', { name: draft.name.trim() || '' })}
      </h1>
      <p className="mt-2.5 text-[16px] leading-snug text-muted">{t('review.sub')}</p>

      {GROUPS.map((g) => (
        <section key={g.id} aria-labelledby={`ob-g-${g.id}`}>
          <h2 id={`ob-g-${g.id}`} className="mx-1 mb-2 mt-6 text-[15px] font-semibold text-ink-2">
            {t(`review.group.${g.id}`)}
          </h2>
          <Card className="overflow-hidden">
            {g.rows.map((id, i) => {
              const v = value(id)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onJump(id)}
                  className={`flex min-h-[64px] w-full items-center gap-3.5 px-4 py-3 text-left active:bg-chip ${i ? 'border-t border-hair' : ''}`}
                >
                  <span aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-grow-l text-grow-d">
                    <Glyph name={v.glyph ?? glyphOf(id)} size={21} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-faint">{t(`row.${id}`)}</span>
                    <span
                      className={`mt-0.5 block text-[17px] font-semibold leading-snug ${
                        v.tone === 'needed' ? 'text-warn-d' : v.tone === 'quiet' ? 'font-medium text-ghost' : 'text-ink'
                      }`}
                    >
                      {v.tone === 'needed' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="alert" size={16} />
                          {v.text}
                        </span>
                      ) : (
                        v.text
                      )}
                    </span>
                  </span>
                  <Icon name="edit" size={18} className="text-ghost" />
                </button>
              )
            })}
          </Card>
        </section>
      ))}

      <p className="mx-1 mt-4 flex items-start gap-2 text-[14px] leading-snug text-muted">
        <Icon name="sprout" size={16} className="mt-0.5 text-grow" />
        {t('review.soilAuto')}
      </p>
    </div>
  )
}
