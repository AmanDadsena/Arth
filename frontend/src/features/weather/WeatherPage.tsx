import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ActionCard,
  BigValue,
  Button,
  Card,
  EmptyState,
  ErrorState,
  EyebrowLabel,
  Icon,
  PageHeader,
  SectionHead,
  Skeleton,
  SkeletonScreen,
  type IconName,
} from '@/components/ui'
import { api } from '@/lib/api/client'
import { qk, round2, useFarmer } from '@/lib/api/queries'
import type { Advisory, Priority, Weather, WeatherDay } from '@/lib/api/types'
import { useLang } from '@/i18n'
import { SpeakButton, sentences } from '@/components/voice'
import { WeatherIcon, rainTone } from './WeatherIcon'
import { dayName } from './format'

/**
 * Weather: what the sky is doing now, the week ahead with rain chance per day,
 * and what that means for spraying and watering.
 */

const SEVERITY_PRIORITY: Record<Advisory['severity'], Priority> = { danger: 'high', warning: 'high', info: 'medium' }
const SEVERITY_ORDER: Record<Advisory['severity'], number> = { danger: 0, warning: 1, info: 2 }
const RULE_ICON: Record<Advisory['rule'], IconName> = {
  rain_no_spray: 'rain',
  heat_irrigate: 'drop',
  wind_no_spray: 'wind',
  other: 'info',
}

function Stat({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[20px] bg-chip px-2 py-3 text-center">
      <Icon name={icon} size={19} className="text-ink-2" />
      <div className="text-[13px] leading-tight text-faint">{label}</div>
      <div className="text-[16px] font-semibold text-ink">{children}</div>
    </div>
  )
}

function CurrentCard({ data }: { data: Weather }) {
  const { t } = useTranslation('weather')
  const c = data.current
  return (
    <Card className="px-5 pb-5 pt-4">
      <EyebrowLabel>{t('now')}</EyebrowLabel>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <BigValue value={<span className="num">{Math.round(c.tempC)}</span>} unit="°C" size={64} />
          <div className="mt-2 text-[18px] font-semibold text-ink">{t(`cond.${c.condition}`)}</div>
          <div className="text-[15px] text-muted">{t('feelsLike', { t: Math.round(c.feelsLikeC) })}</div>
        </div>
        <span className="flex h-[84px] w-[84px] flex-none items-center justify-center rounded-full bg-screen">
          <WeatherIcon condition={c.condition} size={52} strokeWidth={1.7} />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat icon="drop" label={t('humidity')}>
          <span className="num">{Math.round(c.humidity)}%</span>
        </Stat>
        <Stat icon="wind" label={t('wind')}>
          <span className="num">{Math.round(c.windKmh)}</span> <span className="text-[12px] font-medium text-faint">{t('kmh')}</span>
        </Stat>
        <Stat icon="rain" label={t('rain')}>
          <span className={`num ${rainTone(c.rainProb).text}`}>{Math.round(c.rainProb)}%</span>
        </Stat>
      </div>
    </Card>
  )
}

function DayRow({ day }: { day: WeatherDay }) {
  const { t } = useTranslation('weather')
  const { lang } = useLang()
  const name = dayName(day.date, lang, t)
  const p = Math.max(0, Math.min(100, Math.round(day.rainProb)))
  const tone = rainTone(p)
  const cond = t(`cond.${day.condition}`)
  return (
    <li
      className="flex min-h-[60px] items-center gap-3 py-2"
      aria-label={t('rainChanceA11y', { day: name, cond, min: Math.round(day.minC), max: Math.round(day.maxC), p })}
    >
      <div aria-hidden className="w-[62px] flex-none truncate text-[16px] font-semibold text-ink">
        {name}
      </div>
      <WeatherIcon condition={day.condition} size={26} />
      <div aria-hidden className="flex min-w-0 flex-1 items-center gap-2">
        <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-hair">
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(p, 4)}%` }} />
        </div>
        <span className={`num w-[38px] flex-none text-right text-[14px] font-semibold ${tone.text}`}>{p}%</span>
      </div>
      <div aria-hidden className="num w-[68px] flex-none text-right text-[15px]">
        <span className="text-faint">{Math.round(day.minC)}°</span>
        <span className="text-hint"> / </span>
        <span className="font-semibold text-ink">{Math.round(day.maxC)}°</span>
      </div>
    </li>
  )
}

function WeatherSkeleton() {
  return (
    <div role="status" className="space-y-3">
      <Skeleton className="h-[230px] w-full" rounded="rounded-[28px]" />
      <Skeleton className="mt-6 h-6 w-1/3" rounded="rounded-lg" />
      <Skeleton className="h-[300px] w-full" rounded="rounded-[28px]" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

export default function WeatherPage() {
  const { t } = useTranslation('weather')
  const { lang } = useLang()
  const nav = useNavigate()
  const farmer = useFarmer()

  const f = farmer.data
  const hasLocation = !!f && Number.isFinite(f.lat) && Number.isFinite(f.lon) && !(f.lat === 0 && f.lon === 0)
  const lat = f ? round2(f.lat) : 0
  const lon = f ? round2(f.lon) : 0

  const q = useQuery({
    queryKey: qk.weather(lat, lon, lang),
    queryFn: () => api.getWeather(lat, lon, lang),
    enabled: hasLocation,
    staleTime: 15 * 60_000,
  })

  if (farmer.isPending) return <SkeletonScreen cards={3} />

  if (farmer.isError || !f) {
    return (
      <>
        <PageHeader title={t('title')} />
        <div className="mt-4">
          <ErrorState error={farmer.error} title={t('errorTitle')} onRetry={() => void farmer.refetch()} />
        </div>
      </>
    )
  }

  if (!hasLocation) {
    return (
      <>
        <PageHeader title={t('title')} />
        <div className="mt-4">
          <EmptyState
            icon="pin"
            title={t('noLocation')}
            body={t('noLocationBody')}
            action={
              <Button size="md" icon="pin" onClick={() => nav('/onboarding?edit=1')}>
                {t('setLocation')}
              </Button>
            }
          />
        </div>
      </>
    )
  }

  const data = q.data
  const advisories = data ? [...data.advisories].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.date.localeCompare(b.date)) : []

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={
          data?.location || f.village ? (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="pin" size={15} />
              {data?.location || `${f.village}, ${f.district}`}
            </span>
          ) : undefined
        }
      />

      <div className="mt-3">
        {q.isPending ? (
          <WeatherSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} title={t('errorTitle')} onRetry={() => void q.refetch()} />
        ) : !data || data.daily.length === 0 ? (
          <EmptyState icon="cloud" title={t('empty')} body={t('emptyBody')} />
        ) : (
          <>
            <CurrentCard data={data} />

            <SectionHead>{t('advice')}</SectionHead>
            <div className="mb-2.5 flex justify-end">
              <SpeakButton
                text={advisories.length ? sentences(...advisories.flatMap((a) => [a.title, a.detail])) : sentences(t('noAdvice'), t('noAdviceBody'))}
              />
            </div>
            {advisories.length ? (
              <div className="space-y-2.5">
                {advisories.map((a) => (
                  <ActionCard key={a.id} title={a.title} detail={a.detail} priority={SEVERITY_PRIORITY[a.severity]} icon={RULE_ICON[a.rule] ?? 'info'} />
                ))}
              </div>
            ) : (
              <ActionCard title={t('noAdvice')} detail={t('noAdviceBody')} priority="low" icon="check" />
            )}

            <SectionHead>{t('next7')}</SectionHead>
            <Card className="px-5 py-2">
              <ul className="divide-y divide-hair">
                {data.daily.slice(0, 7).map((d) => (
                  <DayRow key={d.date} day={d} />
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>
      {/* room for the floating mic over the last row */}
      <div aria-hidden className="h-16" />
    </>
  )
}
