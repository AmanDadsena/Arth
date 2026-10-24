import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, Icon } from '@/components/ui'
import { LANGS, useLang } from '@/i18n'
import { CROPS, DEFAULTS, FARMING, GOALS, LIVESTOCK, OWNERSHIP, QUESTIONS, SELLS, experienceBucket, isAnswered, type Draft, type QuestionId } from './model'

/** Everything the farmer said, as rows. Tapping a row jumps back to that question. */

const GROUPS: { id: 'you' | 'farm' | 'more'; rows: QuestionId[] }[] = [
  { id: 'you', rows: ['lang', 'name', 'where'] },
  { id: 'farm', rows: ['crops', 'land', 'ownership', 'soil', 'water', 'tank'] },
  { id: 'more', rows: ['experience', 'farmingType', 'goals', 'sellsAt', 'livestock'] },
]

const emojiOf = (id: QuestionId) => QUESTIONS.find((q) => q.id === id)!.emoji
const emojiFor = (opts: { value: string; emoji: string }[], v: string | undefined) => opts.find((o) => o.value === v)?.emoji

export function Review({ draft, onJump, editing }: { draft: Draft; onJump: (id: QuestionId) => void; editing: boolean }) {
  const { t } = useTranslation('onboarding')
  const { t: tc } = useTranslation('common')
  const { lang } = useLang()

  const list = (xs: string[], key: (x: string) => string) => xs.map((x) => t(key(x))).join(', ')

  function value(id: QuestionId): { text: ReactNode; emoji?: string; tone?: 'needed' | 'quiet' } {
    const answered = isAnswered(id, draft)
    switch (id) {
      case 'lang':
        return { text: <span lang={lang}>{LANGS.find((l) => l.code === lang)!.label}</span> }
      case 'name':
        return answered ? { text: draft.name.trim() } : { text: t('review.needed'), tone: 'needed' }
      case 'where':
        return answered ? { text: `${draft.village.trim()}, ${t(`districts.${draft.district}`, { defaultValue: draft.district })}` } : { text: t('review.needed'), tone: 'needed' }
      case 'crops':
        return answered ? { text: draft.crops.map((c) => tc(`crops.${c}`)).join(', '), emoji: emojiFor(CROPS, draft.crops[0]) } : { text: t('review.needed'), tone: 'needed' }
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
      case 'ownership':
        return draft.landOwnership ? { text: t(`ownership.${draft.landOwnership}`), emoji: emojiFor(OWNERSHIP, draft.landOwnership) } : skipped()
      case 'soil':
        return draft.soilType ? { text: tc(`soil.${draft.soilType}`) } : assumed(tc(`soil.${DEFAULTS.soilType}`))
      case 'water':
        return draft.irrigation ? { text: tc(`irrigation.${draft.irrigation}`) } : assumed(tc(`irrigation.${DEFAULTS.irrigation}`))
      case 'tank':
        return draft.tankSizeLitres !== undefined
          ? {
              text: (
                <>
                  <span className="num">{draft.tankSizeLitres}</span> {tc('units.litres')}
                </>
              ),
            }
          : assumed(`${DEFAULTS.tankSizeLitres} ${tc('units.litres')}`)
      case 'experience': {
        const b = experienceBucket(draft.experienceYears)
        return b ? { text: t(`experience.${b.id}`), emoji: b.emoji } : skipped()
      }
      case 'farmingType':
        return draft.farmingType ? { text: t(`farming.${draft.farmingType}`), emoji: emojiFor(FARMING, draft.farmingType) } : skipped()
      case 'goals':
        return answered ? { text: list(draft.goals, (g) => `goals.${g}`), emoji: emojiFor(GOALS, draft.goals[0]) } : skipped()
      case 'sellsAt':
        return answered ? { text: list(draft.sellsAt, (s) => `sells.${s}`), emoji: emojiFor(SELLS, draft.sellsAt[0]) } : skipped()
      case 'livestock':
        return answered ? { text: list(draft.livestock, (a) => `livestock.${a}`), emoji: emojiFor(LIVESTOCK, draft.livestock[0]) } : skipped()
    }
  }

  function skipped() {
    return { text: t('review.skipped'), tone: 'quiet' as const }
  }
  function assumed(v: string) {
    return { text: t('review.assumed', { value: v }), tone: 'quiet' as const }
  }

  return (
    <div className="pt-7">
      <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-card text-[30px] leading-none">
        {editing ? '✏️' : '🌅'}
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
                  <span aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-chip text-[20px] leading-none">
                    {v.emoji ?? emojiOf(id)}
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
    </div>
  )
}
