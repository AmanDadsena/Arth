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
import { FieldCropCard } from '@/features/calendar/FieldCropCard'
import { useSpeech } from './useSpeech'
import { NoVoiceHint } from '@/components/voice'
import { TodayHero } from './TodayHero'

/**
 * Home — "Aaj Ka Kaam". One look answers "what do I do on my farm today?":
 * the sky right now and how far into the season we are, the single most
 * important job in big type, where each of the farmer's crops usually stands
 * today, then the week's weather, price moves and every tool. All of it is
 * live (Open-Meteo, Agmarknet, the crop calendar); one button reads it aloud.
 */

const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

const SHORTCUTS: { key: 'doctor' | 'label' | 'mandi' | 'calendar' | 'schemes' | 'kagaz'; path: string; icon: IconName; tint: string }[] = [
  { key: 'doctor', path: '/doctor', icon: 'doctor', tint: 'bg-grow-l text-grow' },
  { key: 'mandi', path: '/mandi', icon: 'mandi', tint: 'bg-amber-l text-amber' },
  { key: 'calendar', path: '/calendar', icon: 'calendar', tint: 'bg-grow-l text-grow' },
  { key: 'label', path: '/label', icon: 'label', tint: 'bg-warn-l text-warn' },
  { key: 'schemes', path: '/schemes', icon: 'schemes', tint: 'bg-amber-l text-amber' },
  { key: 'kagaz', path: '/kagaz', icon: 'kagaz', tint: 'bg-chip text-ink-2' },
]

const TYPE_ICON: Record<ActionItem['type'], IconName> = {
  spray: 'drop',
  irrigate: 'drop',
  harvest: 'sprout',
  sell: 'mandi',
  sow: 'sprout',
  protect: 'shield',
  scheme: 'schemes',
}

function sortActions(actions: ActionItem[]) {
  return actions
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (RANK[x.a.priority] ?? 1) - (RANK[y.a.priority] ?? 1) || x.i - y.i)
    .map((x) => x.a)
    .slice(0, 3)
}

/** Local calendar day, 'YYYY-MM-DD': a farmer's day is a local day. */
function todayKey() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ---- The one job -------------------------------------------------------------

/** The most important thing today, in big type on deep green (or orange when it is a risk). */
function TopJob({ item }: { item: ActionItem }) {
  const { t } = useTranslation('brief')
  const { t: tc } = useTranslation('common')
  const nav = useNavigate()
  const risk = item.priority === 'high'
  const go = item.route ? () => nav(item.route!) : undefined
  return (
    <button
      type="button"
      onClick={go}
      disabled={!go}
      className={`relative mt-3 block w-full overflow-hidden rounded-[28px] px-5 pb-5 pt-4 text-left text-white ${risk ? 'bg-warn' : 'bg-grow'} active:brightness-95`}
    >
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10" />
      <span className="relative flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[1.4px] text-white/80">
        <Icon name="sparkle" size={15} />
        {t('topJob')}
      </span>
      <span className="relative mt-3 flex items-start gap-3.5">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-white/18 ring-1 ring-white/25">
          <Icon name={TYPE_ICON[item.type]} size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="display block text-[25px] leading-[1.15]">{item.title}</span>
          <span className="mt-1.5 block text-[15.5px] leading-snug text-white/85">{item.detail}</span>
        </span>
      </span>
      <span className="relative mt-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-[12px] font-semibold text-white/90">{tc(`source.${item.source}`)}</span>
        {go ? (
          <span className="inline-flex items-center gap-1 text-[15px] font-semibold">
            {t('open')}
            <Icon name="chevron" size={17} />
          </span>
        ) : null}
      </span>
    </button>
  )
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
              <span className={`text-[14px] font-semibold ${i === 0 ? 'text-grow' : 'text-ink-2'}`}>{name}</span>
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

// ---- Tools -----------------------------------------------------------------

function Tools() {
  const { t } = useTranslation('brief')
  const { t: tn } = useTranslation('nav')
  const nav = useNavigate()
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {SHORTCUTS.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => nav(s.path)}
          aria-label={`${tn(s.key)}. ${t(`hint.${s.key}`)}`}
          className="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-[24px] bg-card px-2 py-3 text-center transition active:scale-[.97] active:bg-chip"
        >
          <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${s.tint}`}>
            <Icon name={s.icon} size={24} />
          </span>
          <span className="block text-[14.5px] font-semibold leading-tight text-ink">{tn(s.key)}</span>
        </button>
      ))}
    </div>
  )
}

// ---- States ----------------------------------------------------------------

function BriefSkeleton() {
  return (
    <div role="status" className="mt-4 space-y-3">
      <Skeleton className="h-[230px] w-full" rounded="rounded-[30px]" />
      <Skeleton className="h-12 w-full" rounded="rounded-3xl" />
      <Skeleton className="h-[150px] w-full" rounded="rounded-[28px]" />
      <div className="flex gap-2.5 pt-3">
        <Skeleton className="h-[170px] w-[248px] flex-none" rounded="rounded-[26px]" />
        <Skeleton className="h-[170px] w-[248px] flex-none" rounded="rounded-[26px]" />
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
      {name ? name.charAt(0).toUpperCase() : <Icon name="profile" />}
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
  const [top, ...others] = actions
  // crop-stage jobs already have their own cards below ("Your crops today")
  const rest = others.filter((a) => !a.id.startsWith('field-'))
  const alerts = brief.priceAlerts ?? []
  // never show a day that has already gone (a cached forecast from yesterday)
  const today = todayKey()
  const days = (brief.weather ?? []).filter((d) => d.date >= today)
  const field = brief.inField ?? []

  function toggleSpeech() {
    if (speech.speaking) speech.stop()
    else
      speech.speak([
        brief.greeting,
        actions.length ? t('speakIntro') : t('noActions'),
        ...actions.map((a) => a.title),
        ...field.map((f) => `${f.name}: ${f.stage}. ${f.task}`),
      ])
  }

  return (
    <>
      <TodayHero location={brief.location} current={brief.current} todayRain={days[0]?.rainProb} season={brief.seasonNow} />

      {speech.supported ? (
        <Button
          variant={speech.speaking ? 'dark' : 'secondary'}
          size="md"
          icon={speech.speaking ? 'close' : 'speaker'}
          onClick={toggleSpeech}
          aria-pressed={speech.speaking}
          className="mt-3"
        >
          {speech.speaking ? t('stop') : t('listen')}
        </Button>
      ) : null}
      <NoVoiceHint lang={lang} />

      {top ? (
        <>
          <TopJob item={top} />
          {rest.length ? (
            <>
              <SectionHead>{t('alsoToday')}</SectionHead>
              <div className="space-y-2.5">
                {rest.map((a) => (
                  <ActionItemCard key={a.id} item={a} onOpen={(route) => nav(route)} />
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : (
        <div className="mt-3">
          <EmptyState icon="check" title={t('noActions')} body={t('noActionsBody')} />
        </div>
      )}

      {field.length ? (
        <>
          <SectionHead action={t('fullCalendar')} onAction={() => nav('/calendar')}>
            {t('inField')}
          </SectionHead>
          <div className="sc -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
            {field.map((f) => (
              <FieldCropCard key={f.crop} f={f} onOpen={() => nav('/calendar')} />
            ))}
          </div>
        </>
      ) : null}

      {days.length ? (
        <>
          <SectionHead action={t('weekWeather')} onAction={() => nav('/weather')}>
            {t('weather')}
          </SectionHead>
          <WeatherStrip days={days} />
        </>
      ) : null}

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
          <EyebrowLabel>{fmtDate(brief?.date ?? todayKey(), lang, { weekday: 'long', day: 'numeric', month: 'long' })}</EyebrowLabel>
          <h1 className="display mt-1 text-[32px] leading-tight text-ink">{brief ? brief.greeting : t('title')}</h1>
        </div>
        <Avatar />
      </header>

      {q.isPending ? (
        <BriefSkeleton />
      ) : q.isError || !brief ? (
        <div className="mt-4 space-y-3">
          <ErrorState error={q.error} title={t('errorTitle')} onRetry={() => void q.refetch()} />
          <EscalateCard />
        </div>
      ) : (
        <BriefBody brief={brief} />
      )}

      <SectionHead>{t('tools')}</SectionHead>
      <Tools />
    </>
  )
}
