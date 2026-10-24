import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { EmptyState, ErrorState, EscalateCard, Icon, PageHeader, SectionHead, Skeleton } from '@/components/ui'
import { api } from '@/lib/api/client'
import { qk } from '@/lib/api/queries'
import type { CalendarResponse, CropRecommendation, MonsoonOnset, Season } from '@/lib/api/types'
import { fmtDate, useLang } from '@/i18n'
import { CropCard } from './CropCard'
import { CropPlan } from './CropPlan'
import { FieldCropCard } from './FieldCropCard'
import { YearMap } from './YearMap'
import { SEASONS } from './season'

/**
 * Crop calendar, worked out from today's date with nothing to choose: where
 * the farming year stands (the year map), what each of the farmer's crops is
 * usually doing now, which crops can be sown today and which open soon.
 * Kharif windows follow the district's own monsoon onset (IMD record), soil
 * comes from the district's Soil Health Card results. Other seasons can still
 * be browsed; each crop opens a week-by-week plan in place.
 */

function ListSkeleton() {
  const { t } = useTranslation('common')
  return (
    <div role="status" aria-label={t('loading')} className="mt-4 space-y-3">
      <Skeleton className="h-[200px] w-full" rounded="rounded-[26px]" />
      <Skeleton className="h-[170px] w-full" rounded="rounded-[26px]" />
      <Skeleton className="h-[212px] w-full" rounded="rounded-[26px]" />
    </div>
  )
}

/** Rutu's point, in one card: the monsoon here moved, so the kharif dates moved with it. */
function OnsetCard({ onset }: { onset: MonsoonOnset }) {
  const { t } = useTranslation('calendar')
  const { lang } = useLang()
  const shift = Math.round(Math.abs(onset.shiftDays))
  const earlier = onset.shiftDays < 0
  const body = onset.significant && shift >= 3
    ? t(earlier ? 'onset.earlier' : 'onset.later', { days: shift, old: fmtDate(onset.oldDate, lang, { day: 'numeric', month: 'long' }) })
    : t('onset.noChange')
  return (
    <div className="mt-3 flex items-start gap-3 rounded-[24px] bg-grow-l px-4 py-3.5">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-grow text-white">
        <Icon name="rain" size={20} />
      </span>
      <span className="min-w-0">
        <span className="block text-[16px] font-semibold leading-snug text-grow-d">
          {t('onset.title', { date: fmtDate(onset.expected, lang, { day: 'numeric', month: 'long' }) })}
        </span>
        <span className="mt-0.5 block text-[14px] leading-snug text-ink-2">{body}</span>
        <span className="mt-1 block text-[12px] text-faint">{t('onset.source', { years: onset.years })}</span>
      </span>
    </div>
  )
}

function Crops({ recs, onOpen }: { recs: CropRecommendation[]; onOpen: (crop: string) => void }) {
  return (
    <div className="space-y-3">
      {recs.map((r) => (
        <CropCard key={r.crop} rec={r} onOpen={() => onOpen(r.crop)} />
      ))}
    </div>
  )
}

export default function CalendarPage() {
  const { t } = useTranslation('calendar')
  const { lang } = useLang()
  // undefined = today's season, decided by the backend from the date
  const [season, setSeason] = useState<Season | undefined>(undefined)
  const [openCrop, setOpenCrop] = useState<string | null>(null)

  const cal = useQuery<CalendarResponse, Error>({
    queryKey: qk.calendar(season ?? 'now', lang),
    queryFn: () => api.getCalendar(season, lang),
  })
  const data = cal.data
  const current = data?.currentSeason ?? data?.season
  const shown = season ?? current

  const recs = data?.recommendations ?? []
  const open = openCrop ? recs.find((r) => r.crop === openCrop) : undefined
  if (open) return <CropPlan rec={open} onBack={() => setOpenCrop(null)} />

  const sowNow = recs.filter((r) => r.status?.phase === 'open')
  const later = recs.filter((r) => r.status?.phase !== 'open')
  const today = data?.today

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={today ? t('today', { date: fmtDate(today, lang, { weekday: 'long', day: 'numeric', month: 'long' }) }) : t('subtitle')}
        back={false}
      />

      {cal.isPending ? (
        <ListSkeleton />
      ) : cal.isError || !data ? (
        <div className="mt-4">
          <ErrorState error={cal.error} onRetry={() => void cal.refetch()} />
        </div>
      ) : (
        <>
          {data.seasonNow ? (
            <p className="mx-1 mt-1 text-[15px] leading-snug text-ink-2">
              {t('seasonLine', { season: data.seasonNow.name, count: data.seasonNow.daysLeft })}
            </p>
          ) : null}

          {today && data.seasons.length ? (
            <div className="mt-3">
              <YearMap today={today} seasons={data.seasons} crops={data.inField} onset={data.onset} />
            </div>
          ) : null}

          {data.onset && shown === 'kharif' ? <OnsetCard onset={data.onset} /> : null}

          {data.inField.length && !season ? (
            <>
              <SectionHead>{t('field.title')}</SectionHead>
              <div className="space-y-2.5">
                {data.inField.map((f) => (
                  <FieldCropCard key={f.crop} f={f} wide />
                ))}
              </div>
            </>
          ) : null}

          <div className="mx-1 mb-2 mt-7 text-[13px] font-semibold uppercase tracking-[1.4px] text-faint">{t('season')}</div>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('season')}>
            {SEASONS.map((s) => {
              const on = s === shown
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setSeason(s === current ? undefined : s)
                    setOpenCrop(null)
                  }}
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

          {recs.length === 0 ? (
            <div className="mt-4 space-y-3">
              <EmptyState icon="calendar" title={t('emptyTitle')} body={t('emptyBody')} />
              <EscalateCard />
            </div>
          ) : (
            <>
              {sowNow.length ? (
                <>
                  <SectionHead>{t('sowNow')}</SectionHead>
                  <Crops recs={sowNow} onOpen={setOpenCrop} />
                </>
              ) : null}
              {later.length ? (
                <>
                  <SectionHead>{sowNow.length ? t('comingUp') : t('recommended')}</SectionHead>
                  <Crops recs={later} onOpen={setOpenCrop} />
                </>
              ) : null}
              <p className="mt-3 px-1 text-center text-[13px] text-faint">{t('basedOn')}</p>
              {recs.every((r) => r.suitability === 'low') ? (
                <div className="mt-4">
                  <EscalateCard reason={t('expertReason')} />
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </>
  )
}
