import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui'
import { api } from '@/lib/api/client'
import { qk } from '@/lib/api/queries'
import type { NutrientShares } from '@/lib/api/types'
import { useLang } from '@/i18n'
import { PIcon } from './parts'

/**
 * The district's Soil Health Card results, found from the farm's location
 * (never typed in): how many tested fields came back low in each nutrient.
 * These are odds for this farm, not a reading of it, and the card says so.
 */

function Bar({ label, s }: { label: string; s: NutrientShares }) {
  const low = Math.round(s.low * 100)
  const mid = Math.round(s.medium * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between text-[14px]">
        <span className="font-semibold text-ink">{label}</span>
        <span className="num text-[13px] font-semibold text-warn-d">{low}%</span>
      </div>
      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-grow-l" aria-hidden>
        <span className="h-full bg-warn" style={{ width: `${low}%` }} />
        <span className="h-full bg-amber/60" style={{ width: `${mid}%` }} />
      </div>
    </div>
  )
}

export function SoilCard() {
  const { t } = useTranslation('profile')
  const { lang } = useLang()
  const q = useQuery({ queryKey: qk.soil(lang), queryFn: () => api.getSoil(lang), staleTime: 24 * 60 * 60_000 })
  if (q.isPending) return <Skeleton className="h-[220px] w-full" rounded="rounded-[26px]" />
  if (!q.data) return null
  const s = q.data
  const bars = [
    ['nitrogen', s.nitrogen],
    ['phosphorus', s.phosphorus],
    ['potassium', s.potassium],
    ['carbon', s.organicCarbon],
  ] as const
  return (
    <div className="rounded-[26px] bg-card px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-grow-l text-grow-d">
          <PIcon name="layers" size={21} />
        </span>
        <div className="min-w-0">
          <div className="text-[16.5px] font-semibold leading-snug text-ink">{t('soil.title', { district: s.districtLocal })}</div>
          <div className="mt-0.5 text-[13px] leading-snug text-muted">
            {s.samples ? t('soil.sub', { samples: s.samples.toLocaleString('en-IN'), cycle: s.cycle }) : t('soil.noTests')}
          </div>
        </div>
      </div>
      {s.samples ? (
        <>
          <div className="mt-4 space-y-3">
            {bars.map(([k, v]) => (v ? <Bar key={k} label={t(`soil.${k}`)} s={v} /> : null))}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[12px] text-faint">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-warn" />
              {t('soil.low')}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber/60" />
              {t('soil.medium')}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-grow-l ring-1 ring-grow/30" />
              {t('soil.high')}
            </span>
          </div>
        </>
      ) : null}
      {s.tips.length ? (
        <ul className="mt-4 space-y-2 border-t border-hair pt-3">
          {s.tips.map((tip) => (
            <li key={tip} className="flex items-start gap-2 text-[14px] leading-snug text-ink-2">
              <PIcon name="check" size={15} className="mt-0.5 text-grow" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <a href={s.source} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-grow">
        {t('soil.source')}
        <PIcon name="chevron" size={15} />
      </a>
    </div>
  )
}
