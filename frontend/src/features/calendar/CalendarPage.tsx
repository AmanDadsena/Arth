import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Chip, EmptyState, ErrorState, EscalateCard, Icon, PageHeader, SectionHead, Skeleton } from '@/components/ui'
import { api } from '@/lib/api/client'
import { qk, useFarmer } from '@/lib/api/queries'
import type { CalendarResponse, Season } from '@/lib/api/types'
import { useLang } from '@/i18n'
import { CropCard } from './CropCard'
import { CropPlan } from './CropPlan'
import { SEASONS, seasonFor } from './season'

/**
 * Crop calendar: the season is picked from today's month (and can be changed),
 * soil and water come from the profile, and each recommended crop opens a
 * week-by-week plan in place (no extra route — this is a bottom-nav tab).
 */

const RANK = { high: 0, medium: 1, low: 2 } as const

function ListSkeleton() {
  const { t } = useTranslation('common')
  return (
    <div role="status" aria-label={t('loading')} className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[212px] w-full" rounded="rounded-[26px]" />
      ))}
    </div>
  )
}

export default function CalendarPage() {
  const { t } = useTranslation('calendar')
  const { t: tc } = useTranslation('common')
  const nav = useNavigate()
  const { lang } = useLang()
  const current = seasonFor()
  const [season, setSeason] = useState<Season>(current)
  const [openCrop, setOpenCrop] = useState<string | null>(null)
  const farmer = useFarmer().data

  const cal = useQuery<CalendarResponse, Error>({
    queryKey: qk.calendar(season, lang),
    queryFn: () => api.getCalendar(season, lang),
  })

  const recs = [...(cal.data?.recommendations ?? [])].sort((a, b) => RANK[a.suitability] - RANK[b.suitability])
  const open = openCrop ? recs.find((r) => r.crop === openCrop) : undefined

  if (open) return <CropPlan rec={open} onBack={() => setOpenCrop(null)} />

  function pick(s: Season) {
    setSeason(s)
    setOpenCrop(null)
  }

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} back={false} />

      <div className="mx-1 mb-2 mt-4 text-[13px] font-semibold uppercase tracking-[1.4px] text-faint">{t('season')}</div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('season')}>
        {SEASONS.map((s) => {
          const on = s === season
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(s)}
              className={`flex min-h-[64px] flex-col items-center justify-center rounded-[22px] px-1 py-2 text-center transition ${on ? 'bg-grow text-white' : 'bg-card text-ink active:bg-chip'}`}
            >
              <span className="text-[17px] font-semibold leading-tight">{t(`seasons.${s}`)}</span>
              <span className={`mt-0.5 text-[12px] leading-tight ${on ? 'text-white/80' : 'text-faint'}`}>
                {s === current ? t('now') : t(`seasonMonths.${s}`)}
              </span>
            </button>
          )
        })}
      </div>

      {farmer ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip tone="white">
            <Icon name="sprout" size={15} />
            {t('soilChip', { soil: tc(`soil.${farmer.soilType}`) })}
          </Chip>
          <Chip tone="white">
            <Icon name="drop" size={15} />
            {tc(`irrigation.${farmer.irrigation}`)}
          </Chip>
          <button type="button" onClick={() => nav('/profile')} className="min-h-11 px-2 text-[14px] font-semibold text-grow">
            {t('editFarm')}
          </button>
        </div>
      ) : null}

      <SectionHead>{t('recommended')}</SectionHead>

      {cal.isPending ? (
        <ListSkeleton />
      ) : cal.isError ? (
        <ErrorState error={cal.error} onRetry={() => void cal.refetch()} />
      ) : recs.length === 0 ? (
        <div className="space-y-3">
          <EmptyState icon="calendar" title={t('emptyTitle')} body={t('emptyBody')} />
          <EscalateCard />
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {recs.map((r) => (
              <CropCard key={r.crop} rec={r} onOpen={() => setOpenCrop(r.crop)} />
            ))}
          </div>
          <p className="mt-3 px-1 text-center text-[13px] text-faint">{t('basedOn')}</p>
          {recs.every((r) => r.suitability === 'low') ? (
            <div className="mt-4">
              <EscalateCard reason={t('expertReason')} />
            </div>
          ) : null}
        </>
      )}
    </>
  )
}
