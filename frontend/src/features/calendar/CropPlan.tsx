import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Card, EmptyState, EscalateCard, EyebrowLabel, Icon, IconButton, SectionHead } from '@/components/ui'
import type { CropRecommendation } from '@/lib/api/types'
import { fmtDate, useLang } from '@/i18n'
import { addDays } from './season'
import { SUIT_TONE } from './CropCard'
import { WhyNowSection, hasWhyNow } from './WhyNow'

/** One crop's week-by-week plan: a vertical timeline of dots on a line. */
export function CropPlan({ rec, onBack }: { rec: CropRecommendation; onBack: () => void }) {
  const { t } = useTranslation('calendar')
  const { lang } = useLang()
  const top = useRef<HTMLDivElement>(null)

  // the list may have been scrolled far down; start the plan at its top
  useEffect(() => {
    // the app shell scrolls <main>, not the window
    top.current?.closest('main')?.scrollTo({ top: 0 })
  }, [])

  const weeks = [...rec.timeline].sort((a, b) => a.week - b.week)
  const harvest = addDays(rec.sowingWindow.from, rec.durationDays)

  return (
    <div ref={top}>
      <header className="flex items-start gap-3 pb-2">
        <IconButton icon="back" label={t('backToList')} onClick={onBack} />
        <div className="min-w-0 flex-1 pt-0.5">
          <h1 className="display text-[30px] leading-tight text-ink">{rec.name}</h1>
          <p className="mt-0.5 text-[15px] text-muted">{t('plan')}</p>
        </div>
      </header>

      <Card className="mt-3 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <EyebrowLabel>{t('sowing')}</EyebrowLabel>
          <Badge tone={SUIT_TONE[rec.suitability]}>{t(`suitability.${rec.suitability}`)}</Badge>
        </div>
        <div className="num mt-1.5 text-[22px] font-semibold text-ink">
          {fmtDate(rec.sowingWindow.from, lang)} – {fmtDate(rec.sowingWindow.to, lang)}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="calendar" size={16} />
            {t('duration', { days: rec.durationDays })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="sprout" size={16} />
            {t('harvestBy', { date: fmtDate(harvest, lang) })}
          </span>
        </div>
        <p className="mt-3 border-t border-hair pt-3 text-[15px] leading-snug text-ink-2">{rec.why}</p>
      </Card>

      <WhyNowSection whyNow={rec.whyNow} />
      {hasWhyNow(rec.whyNow) ? <SectionHead>{t('plan')}</SectionHead> : null}

      {weeks.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon="calendar" title={t('plan')} body={t('planEmpty')} />
        </div>
      ) : (
        <ol className="mt-5 px-1" aria-label={t('plan')}>
          {weeks.map((w, i) => {
            const last = i === weeks.length - 1
            return (
              <li key={w.week} className="relative flex gap-4 pb-5 last:pb-0">
                {/* the line runs from this dot to the next one */}
                {!last ? <span aria-hidden className="absolute bottom-0 left-[17px] top-9 w-0.5 rounded-full bg-track" /> : null}
                <span
                  aria-hidden
                  className={`num relative z-10 flex h-9 w-9 flex-none items-center justify-center rounded-full text-[14px] font-semibold ${
                    i === 0 ? 'bg-grow text-white' : 'bg-grow-l text-grow-d'
                  }`}
                >
                  {w.week}
                </span>
                <Card className="min-w-0 flex-1 rounded-[22px] px-4 py-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-[13px] font-semibold uppercase tracking-[1.2px] text-faint">{t('week', { n: w.week })}</span>
                    <span className="num text-[13px] text-faint">{t('weekOf', { date: fmtDate(addDays(rec.sowingWindow.from, (w.week - 1) * 7), lang) })}</span>
                  </div>
                  <div className="mt-1 text-[18px] font-semibold leading-snug text-ink">{w.title}</div>
                  {w.tasks.length ? (
                    <ul className="mt-2 space-y-1.5">
                      {w.tasks.map((task) => (
                        <li key={task} className="flex items-start gap-2 text-[15px] leading-snug text-ink-2">
                          <Icon name="check" size={16} className="mt-0.5 text-grow" />
                          <span>{task}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Card>
              </li>
            )
          })}
        </ol>
      )}

      <div className="mt-6">
        <EscalateCard reason={t('expertReason')} />
      </div>
    </div>
  )
}
