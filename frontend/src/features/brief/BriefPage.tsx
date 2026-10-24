import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ActionItemCard,
  Button,
  EmptyState,
  ErrorState,
  EscalateCard,
  EyebrowLabel,
  Icon,
  SectionHead,
  Skeleton,
  type IconName,
} from '@/components/ui'
import { api } from '@/lib/api/client'
import { qk, useFarmer } from '@/lib/api/queries'
import type { ActionItem, Brief, PriceAlert, Priority, WeatherDay } from '@/lib/api/types'
import { fmtDate, rupees, useLang } from '@/i18n'
import { WeatherIcon, rainTone } from '@/features/weather/WeatherIcon'
import { dayName } from '@/features/weather/format'
import { useSpeech } from './useSpeech'

/**
 * Home — "Aaj Ka Kaam": greeting, the next four days of weather, the two or
 * three things worth doing today, price moves on the farmer's crops, and big
 * tiles into every tool. One button reads the brief aloud.
 */

const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

const SHORTCUTS: { key: 'doctor' | 'label' | 'mandi' | 'calendar' | 'schemes' | 'kagaz'; path: string; icon: IconName }[] = [
  { key: 'doctor', path: '/doctor', icon: 'doctor' },
  { key: 'label', path: '/label', icon: 'label' },
  { key: 'mandi', path: '/mandi', icon: 'mandi' },
  { key: 'calendar', path: '/calendar', icon: 'calendar' },
  { key: 'schemes', path: '/schemes', icon: 'schemes' },
  { key: 'kagaz', path: '/kagaz', icon: 'kagaz' },
]

function sortActions(actions: ActionItem[]) {
  return actions
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (RANK[x.a.priority] ?? 1) - (RANK[y.a.priority] ?? 1) || x.i - y.i)
    .map((x) => x.a)
    .slice(0, 3)
}

// ---- Weather strip ---------------------------------------------------------

function WeatherStrip({ days }: { days: WeatherDay[] }) {
  const { t } = useTranslation('brief')
  const { t: tw } = useTranslation('weather')
  const { lang } = useLang()
  const nav = useNavigate()
  const shown = days.slice(0, 4)
  const spoken = shown
    .map((d) => t('dayA11y', { day: dayName(d.date, lang, tw, { tomorrow: false }), cond: tw(`cond.${d.condition}`), min: Math.round(d.minC), max: Math.round(d.maxC), p: Math.round(d.rainProb) }))
    .join('. ')
  return (
    <button type="button" onClick={() => nav('/weather')} className="block w-full rounded-[28px] bg-card px-2 py-3.5 text-left active:bg-chip" aria-label={`${tw('title')}. ${spoken}`}>
      <span aria-hidden className="grid grid-cols-4">
        {shown.map((d, i) => {
          const name = dayName(d.date, lang, tw, { tomorrow: false })
          const p = Math.round(d.rainProb)
          return (
            <span key={d.date} className={`flex flex-col items-center gap-1.5 px-1 ${i > 0 ? 'border-l border-hair' : ''}`}>
              <span className={`text-[14px] font-semibold ${i === 0 ? 'text-grow' : 'text-ink-2'}`}>
                {name}
              </span>
              <WeatherIcon condition={d.condition} size={30} />
              <span className="num text-[15px]">
                <span className="font-semibold text-ink">{Math.round(d.maxC)}°</span>
                <span className="text-faint"> {Math.round(d.minC)}°</span>
              </span>
              <span className={`inline-flex items-center gap-0.5 text-[13px] font-semibold ${rainTone(p).text}`}>
                <Icon name="drop" size={12} />
                <span className="num">{p}%</span>
              </span>
            </span>
          )
        })}
      </span>
    </button>
  )
}

// ---- Price alerts ----------------------------------------------------------

function PriceChip({ alert }: { alert: PriceAlert }) {
  const { t } = useTranslation('brief')
  const { t: tc } = useTranslation('common')
  const nav = useNavigate()
  const crop = tc(`crops.${alert.commodity}`, { defaultValue: alert.commodity })
  const pct = Math.abs(alert.changePct)
  const pctText = pct.toFixed(pct >= 10 ? 0 : 1)
  const tone =
    alert.direction === 'up' ? 'bg-grow-l text-grow-d' : alert.direction === 'down' ? 'bg-warn-l text-warn-d' : 'bg-chip text-muted'
  const dir = alert.direction === 'up' ? t('dirUp') : alert.direction === 'down' ? t('dirDown') : t('dirFlat')
  return (
    <button
      type="button"
      onClick={() => nav('/mandi')}
      className="flex min-h-[76px] w-[188px] flex-none flex-col justify-between rounded-[24px] bg-card px-4 py-3 text-left active:bg-chip"
      aria-label={t('priceA11y', { crop, market: alert.market, price: rupees(alert.modalPrice), dir, pct: pctText })}
    >
      <span aria-hidden className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[16px] font-semibold text-ink">{crop}</span>
        <span className={`inline-flex flex-none items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[13px] font-semibold ${tone}`}>
          {alert.direction === 'flat' ? null : <Icon name={alert.direction === 'up' ? 'up' : 'down'} size={13} strokeWidth={2.4} />}
          <span className="num">{pctText}%</span>
        </span>
      </span>
      <span aria-hidden className="mt-1 block truncate text-[13px] text-muted">{alert.market}</span>
      <span aria-hidden className="mt-0.5 flex items-baseline gap-1">
        <span className="num text-[18px] font-semibold text-ink">{rupees(alert.modalPrice)}</span>
        <span className="text-[12px] text-faint">{t('perQtl')}</span>
      </span>
    </button>
  )
}

// ---- Shortcuts -------------------------------------------------------------

function Shortcuts() {
  const { t } = useTranslation('brief')
  const { t: tn } = useTranslation('nav')
  const nav = useNavigate()
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {SHORTCUTS.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => nav(s.path)}
          className="flex min-h-[84px] flex-col items-start justify-between gap-2 rounded-[24px] bg-card px-4 py-3.5 text-left active:bg-chip"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-grow-l text-grow">
            <Icon name={s.icon} size={21} />
          </span>
          <span className="block">
            <span className="block text-[17px] font-semibold leading-tight text-ink">{tn(s.key)}</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t(`hint.${s.key}`)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

// ---- States ----------------------------------------------------------------

function BriefSkeleton() {
  return (
    <div role="status" className="space-y-3">
      <Skeleton className="h-4 w-1/3" rounded="rounded-lg" />
      <Skeleton className="h-10 w-3/4" rounded="rounded-xl" />
      <Skeleton className="h-12 w-full" rounded="rounded-3xl" />
      <Skeleton className="mt-4 h-[124px] w-full" rounded="rounded-[28px]" />
      <Skeleton className="mt-4 h-24 w-full" rounded="rounded-[26px]" />
      <Skeleton className="h-24 w-full" rounded="rounded-[26px]" />
      <div className="flex gap-2.5 pt-3">
        <Skeleton className="h-[76px] w-[188px] flex-none" rounded="rounded-[24px]" />
        <Skeleton className="h-[76px] w-[188px] flex-none" rounded="rounded-[24px]" />
      </div>
    </div>
  )
}

function Avatar() {
  const { t } = useTranslation('brief')
  const nav = useNavigate()
  const name = useFarmer().data?.name?.trim()
  return (
    <button
      type="button"
      onClick={() => nav('/profile')}
      aria-label={t('profile')}
      className="display flex h-12 w-12 flex-none items-center justify-center rounded-[20px] bg-grow text-[22px] text-white active:brightness-90"
    >
      {name ? name.charAt(0) : <Icon name="profile" />}
    </button>
  )
}

// ---- Page ------------------------------------------------------------------

function BriefBody({ brief }: { brief: Brief }) {
  const { t } = useTranslation('brief')
  const { lang } = useLang()
  const nav = useNavigate()
  const speech = useSpeech(lang)
  const actions = sortActions(brief.actions ?? [])
  const alerts = brief.priceAlerts ?? []
  const days = brief.weather ?? []

  function toggleSpeech() {
    if (speech.speaking) speech.stop()
    else speech.speak([brief.greeting, actions.length ? t('speakIntro') : t('noActions'), ...actions.map((a) => a.title)])
  }

  return (
    <>
      {speech.supported ? (
        <Button
          variant={speech.speaking ? 'dark' : 'secondary'}
          size="md"
          icon={speech.speaking ? 'close' : 'speaker'}
          onClick={toggleSpeech}
          aria-pressed={speech.speaking}
          className="mt-4"
        >
          {speech.speaking ? t('stop') : t('listen')}
        </Button>
      ) : null}

      {days.length ? (
        <>
          <SectionHead action={t('weekWeather')} onAction={() => nav('/weather')}>
            {t('weather')}
          </SectionHead>
          <WeatherStrip days={days} />
        </>
      ) : null}

      <SectionHead>{t('todo')}</SectionHead>
      {actions.length ? (
        <div className="space-y-2.5">
          {actions.map((a) => (
            <ActionItemCard key={a.id} item={a} onOpen={(route) => nav(route)} />
          ))}
        </div>
      ) : (
        <EmptyState icon="check" title={t('noActions')} body={t('noActionsBody')} />
      )}

      {alerts.length ? (
        <>
          <SectionHead action={t('allPrices')} onAction={() => nav('/mandi')}>
            {t('prices')}
          </SectionHead>
          <div className="sc -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
            {alerts.map((a) => (
              <PriceChip key={`${a.commodity}-${a.market}`} alert={a} />
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}

export default function BriefPage() {
  const { t } = useTranslation('brief')
  const { lang } = useLang()
  const q = useQuery({ queryKey: qk.brief(lang), queryFn: () => api.getBrief(lang) })
  const brief = q.data

  return (
    <>
      <header className="flex items-start gap-3 pt-1">
        <div className="min-w-0 flex-1">
          {brief ? (
            <>
              <EyebrowLabel>{fmtDate(brief.date, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</EyebrowLabel>
              <h1 className="display mt-1 text-[32px] leading-tight text-ink">{brief.greeting}</h1>
              <p className="mt-0.5 text-[16px] text-muted">{t('title')}</p>
            </>
          ) : (
            <h1 className="display text-[32px] leading-tight text-ink">{t('title')}</h1>
          )}
        </div>
        <Avatar />
      </header>

      {q.isPending ? (
        <div className="mt-4">
          <BriefSkeleton />
        </div>
      ) : q.isError || !brief ? (
        <div className="mt-4 space-y-3">
          <ErrorState error={q.error} title={t('errorTitle')} onRetry={() => void q.refetch()} />
          <EscalateCard />
        </div>
      ) : (
        <BriefBody brief={brief} />
      )}

      <SectionHead>{t('tools')}</SectionHead>
      <Shortcuts />
    </>
  )
}
