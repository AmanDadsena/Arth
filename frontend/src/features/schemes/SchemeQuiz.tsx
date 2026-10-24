import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Chip, Icon, IconButton, type IconName } from '@/components/ui'
import { round2 } from '@/lib/api/queries'
import type { Irrigation, SchemeAnswers } from '@/lib/api/types'

/**
 * One question per screen, big answers, a progress bar and a back button.
 * Yes/no and choice answers move on by themselves; the acres stepper has Next.
 */

export type Draft = Partial<SchemeAnswers>

type Question =
  | { key: 'ownsLand' | 'hasBankAccount' | 'hasAadhaar' | 'isWoman' | 'incomeTaxPayer'; kind: 'yesno'; icon: IconName }
  | { key: 'landAcres'; kind: 'acres'; icon: IconName }
  | { key: 'category'; kind: 'category'; icon: IconName }
  | { key: 'irrigation'; kind: 'irrigation'; icon: IconName }

export const QUESTIONS: Question[] = [
  { key: 'ownsLand', kind: 'yesno', icon: 'pin' },
  { key: 'landAcres', kind: 'acres', icon: 'sprout' },
  { key: 'category', kind: 'category', icon: 'profile' },
  { key: 'hasBankAccount', kind: 'yesno', icon: 'schemes' },
  { key: 'hasAadhaar', kind: 'yesno', icon: 'shield' },
  { key: 'isWoman', kind: 'yesno', icon: 'profile' },
  { key: 'irrigation', kind: 'irrigation', icon: 'drop' },
  { key: 'incomeTaxPayer', kind: 'yesno', icon: 'kagaz' },
]

const CATEGORIES: SchemeAnswers['category'][] = ['general', 'obc', 'sc', 'st']
const WATER: Irrigation[] = ['rainfed', 'drip', 'sprinkler', 'canal', 'borewell']

function BigOption({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon?: IconName; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex min-h-[68px] w-full items-center justify-between gap-3 rounded-[26px] px-6 py-3 text-left text-[20px] font-semibold transition ${
        on ? 'bg-grow text-white' : 'bg-card text-ink active:bg-chip'
      }`}
    >
      <span className="flex items-center gap-3">
        {icon ? <Icon name={icon} /> : null}
        {children}
      </span>
      {on ? <Icon name="check" /> : null}
    </button>
  )
}

export function SchemeQuiz({
  step,
  draft,
  profile,
  onAnswer,
  onBack,
}: {
  step: number
  draft: Draft
  /** profile values used to prefill acres and irrigation */
  profile: { landAcres?: number; irrigation?: Irrigation }
  onAnswer: (patch: Draft) => void
  onBack: () => void
}) {
  const { t } = useTranslation('schemes')
  const { t: tc } = useTranslation('common')
  const q = QUESTIONS[step]!
  const total = QUESTIONS.length
  const acresDefault = draft.landAcres ?? profile.landAcres ?? 1
  const [acres, setAcres] = useState(acresDefault)

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3.5">
        <IconButton icon="back" label={tc('back')} onClick={onBack} />
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-track"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={step + 1}
          aria-label={t('progress', { n: step + 1, total })}
        >
          <div className="h-full rounded-full bg-grow transition-all duration-300" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
        <div className="num flex-none text-sm font-semibold text-faint">{t('progress', { n: step + 1, total })}</div>
      </div>

      <div className="fade pt-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-grow-l text-grow">
          <Icon name={q.icon} />
        </span>
        <h1 className="display mt-4 text-[30px] leading-tight text-ink">{t(`q.${q.key}.title`)}</h1>
        <p className="mt-2 text-[16px] leading-snug text-muted">{t(`q.${q.key}.hint`)}</p>

        {q.kind === 'yesno' && (
          <div className="mt-7 space-y-3" role="radiogroup" aria-label={t(`q.${q.key}.title`)}>
            <BigOption icon="check" on={draft[q.key] === true} onClick={() => onAnswer({ [q.key]: true })}>
              {t('yes')}
            </BigOption>
            <BigOption icon="close" on={draft[q.key] === false} onClick={() => onAnswer({ [q.key]: false })}>
              {t('no')}
            </BigOption>
          </div>
        )}

        {q.kind === 'category' && (
          <div className="mt-7 space-y-3" role="radiogroup" aria-label={t(`q.${q.key}.title`)}>
            {CATEGORIES.map((c) => (
              <BigOption key={c} on={draft.category === c} onClick={() => onAnswer({ category: c })}>
                {t(`category.${c}`)}
              </BigOption>
            ))}
          </div>
        )}

        {q.kind === 'irrigation' && (
          <>
            {draft.irrigation === undefined && profile.irrigation ? (
              <div className="mt-4">
                <Chip tone="grow">
                  <Icon name="profile" size={15} />
                  {t('fromProfile')}
                </Chip>
              </div>
            ) : null}
            <div className="mt-4 space-y-3" role="radiogroup" aria-label={t(`q.${q.key}.title`)}>
              {WATER.map((w) => (
                <BigOption key={w} on={(draft.irrigation ?? profile.irrigation) === w} onClick={() => onAnswer({ irrigation: w })}>
                  {tc(`irrigation.${w}`)}
                </BigOption>
              ))}
            </div>
          </>
        )}

        {q.kind === 'acres' && (
          <>
            {draft.landAcres === undefined && profile.landAcres !== undefined && acres === profile.landAcres ? (
              <div className="mt-4">
                <Chip tone="grow">
                  <Icon name="profile" size={15} />
                  {t('fromProfile')}
                </Chip>
              </div>
            ) : null}
            <div className="mt-4 flex items-center gap-3 rounded-[28px] bg-card p-2.5">
              <button
                type="button"
                aria-label="−"
                disabled={acres <= 0}
                onClick={() => setAcres(Math.max(0, round2(acres - 0.5)))}
                className="h-14 w-14 rounded-[22px] bg-chip text-[28px] font-semibold text-ink disabled:text-hint"
              >
                −
              </button>
              <div className="flex-1 text-center" aria-live="polite">
                <span className="num text-[34px] font-semibold text-ink">{acres}</span> <span className="text-[16px] text-faint">{tc('units.acres')}</span>
              </div>
              <button
                type="button"
                aria-label="+"
                onClick={() => setAcres(round2(acres + 0.5))}
                className="h-14 w-14 rounded-[22px] bg-chip text-[28px] font-semibold text-ink"
              >
                +
              </button>
            </div>
          </>
        )}
      </div>

      {q.kind === 'acres' ? (
        <div className="pt-8">
          <Button onClick={() => onAnswer({ landAcres: acres })}>{tc('next')}</Button>
        </div>
      ) : null}
    </div>
  )
}
