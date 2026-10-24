import { useTranslation } from 'react-i18next'
import { Badge, Icon } from '@/components/ui'
import type { CropRecommendation } from '@/lib/api/types'
import { fmtDate, useLang } from '@/i18n'

export const SUIT_TONE = { high: 'grow', medium: 'amber', low: 'neutral' } as const

/** A recommended crop; tapping it opens the week-by-week plan. */
export function CropCard({ rec, onOpen }: { rec: CropRecommendation; onOpen: () => void }) {
  const { t } = useTranslation('calendar')
  const { lang } = useLang()
  return (
    <button type="button" onClick={onOpen} className="block w-full rounded-[26px] bg-card px-5 py-4 text-left active:bg-chip">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-grow-l text-grow">
            <Icon name="sprout" />
          </span>
          <span className="display truncate text-[22px] leading-tight text-ink">{rec.name}</span>
        </span>
        <Badge tone={SUIT_TONE[rec.suitability]} className="mt-1 flex-none">
          {t(`suitability.${rec.suitability}`)}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-chip px-3 py-2">
          <div className="text-[12px] font-semibold uppercase tracking-[1.2px] text-faint">{t('sowing')}</div>
          <div className="num mt-0.5 text-[15px] font-semibold text-ink">
            {fmtDate(rec.sowingWindow.from, lang)} – {fmtDate(rec.sowingWindow.to, lang)}
          </div>
        </div>
        <div className="rounded-2xl bg-chip px-3 py-2">
          <div className="text-[12px] font-semibold uppercase tracking-[1.2px] text-faint">{t('durationLabel')}</div>
          <div className="num mt-0.5 text-[15px] font-semibold text-ink">{t('duration', { days: rec.durationDays })}</div>
        </div>
      </div>

      <p className="mt-3 text-[15px] leading-snug text-ink-2">{rec.why}</p>

      <span className="mt-3 flex min-h-11 items-center justify-between border-t border-hair pt-2 text-[15px] font-semibold text-grow">
        {t('openPlan')}
        <Icon name="chevron" size={18} />
      </span>
    </button>
  )
}
