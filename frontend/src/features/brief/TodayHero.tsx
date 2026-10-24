import { useTranslation } from 'react-i18next'
import { Icon } from '@/components/ui'
import type { CurrentWeather, SeasonNow, WeatherCondition } from '@/lib/api/types'
import { fmtDate, useLang } from '@/i18n'
import { WeatherIcon } from '@/features/weather/WeatherIcon'

/**
 * The top of Home: the sky the farmer is standing under right now. The
 * gradient follows the live weather (rain, cloud, heat, a clear day) the way
 * Rutu's dashboard does; on it sit the place, the temperature now, and how far
 * we are into the sowing season. Cards and ink never change, so it stays
 * readable in sunlight.
 */

type Mood = 'rain' | 'overcast' | 'sun' | 'clear'

const SKY: Record<Mood, { from: string; mid: string; to: string; hill: string; hill2: string }> = {
  rain: { from: '#c9d5d1', mid: '#dfe5df', to: '#eef0e8', hill: '#5f8a76', hill2: '#9fb9a7' },
  overcast: { from: '#d6d6cd', mid: '#e4e2d8', to: '#efece2', hill: '#6f8a6a', hill2: '#a9b79c' },
  sun: { from: '#f6d9a4', mid: '#f7e6c6', to: '#f4ecdc', hill: '#2e6b3f', hill2: '#86a777' },
  clear: { from: '#d8e6d4', mid: '#ece8d6', to: '#f4ede0', hill: '#2e6b3f', hill2: '#86a777' },
}

function moodFor(c: WeatherCondition | undefined, tempC: number | undefined): Mood {
  if (c === 'rain' || c === 'heavy_rain' || c === 'thunderstorm') return 'rain'
  if (c === 'cloudy' || c === 'fog') return 'overcast'
  if ((tempC ?? 0) >= 33) return 'sun'
  return 'clear'
}

function SkyArt({ mood }: { mood: Mood }) {
  const s = SKY[mood]
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: `linear-gradient(170deg, ${s.from} 0%, ${s.mid} 55%, ${s.to} 100%)` }} />
      {mood === 'sun' || mood === 'clear' ? (
        <div
          className="dawn-glow absolute -right-8 -top-10 h-44 w-44 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,222,150,.85) 0%, rgba(248,194,102,.35) 45%, transparent 70%)' }}
        />
      ) : null}
      {mood === 'rain' ? (
        <svg className="absolute inset-0 h-full w-full opacity-30" viewBox="0 0 200 120" preserveAspectRatio="none">
          {Array.from({ length: 18 }, (_, i) => (
            <line key={i} x1={8 + i * 11} y1={(i * 17) % 40} x2={4 + i * 11} y2={((i * 17) % 40) + 14} stroke="#4f6f66" strokeWidth="1" strokeLinecap="round" />
          ))}
        </svg>
      ) : null}
      <svg className="absolute inset-x-0 -bottom-px h-[46%] w-full" viewBox="0 0 400 120" preserveAspectRatio="none">
        <path d="M0 58 C 60 34, 120 40, 180 52 S 300 30, 400 46 L 400 120 L 0 120 Z" fill={s.hill2} opacity=".55" />
        <path d="M0 84 C 80 62, 160 68, 240 80 S 340 70, 400 76 L 400 120 L 0 120 Z" fill={s.hill} opacity=".22" />
        <g stroke={s.hill} strokeWidth="1" fill="none" opacity=".18">
          <path d="M0 100 C 90 88, 180 92, 260 98 S 360 92, 400 96" />
          <path d="M0 110 C 100 100, 190 104, 270 108 S 360 104, 400 106" />
        </g>
      </svg>
    </div>
  )
}

function SeasonBar({ s }: { s: SeasonNow }) {
  const { t } = useTranslation('brief')
  const { lang } = useLang()
  const pct = Math.min(100, Math.max(2, Math.round(s.progress * 100)))
  return (
    <div className="mt-4 rounded-[20px] bg-white/70 px-3.5 py-3 backdrop-blur-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold text-ink">{t('hero.season', { season: s.name })}</span>
        <span className="num text-[12.5px] font-semibold text-muted">{t('hero.daysLeft', { count: s.daysLeft })}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-track/70" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('hero.season', { season: s.name })}>
        <div className="h-full rounded-full bg-grow" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 text-[12.5px] text-muted">
        {t('hero.next', { season: t(`seasons.${s.nextSeason}`), date: fmtDate(s.nextStarts, lang, { day: 'numeric', month: 'long' }) })}
      </div>
    </div>
  )
}

export function TodayHero({ location, current, todayRain, season }: { location: string; current: CurrentWeather | null; todayRain?: number; season: SeasonNow | null }) {
  const { t } = useTranslation('brief')
  const { t: tw } = useTranslation('weather')
  const mood = moodFor(current?.condition, current?.tempC)
  return (
    <section className="relative mt-4 overflow-hidden rounded-[30px] px-5 pb-5 pt-4 shadow-[0_10px_30px_-18px_rgba(23,21,15,.45)]">
      <SkyArt mood={mood} />
      <div className="relative">
        {location ? (
          <div className="flex items-center gap-1.5 text-[14px] font-semibold text-ink-2">
            <Icon name="pin" size={15} className="text-grow" />
            <span className="truncate">{location}</span>
          </div>
        ) : null}
        {current ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-start">
                <span className="display num text-[64px] leading-[.95] text-ink">{Math.round(current.tempC)}</span>
                <span className="display mt-1 text-[30px] leading-none text-ink-2">°</span>
              </div>
              <div className="mt-1 text-[17px] font-semibold text-ink">{tw(`cond.${current.condition}`)}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13.5px] text-ink-2">
                <span>{tw('feelsLike', { t: Math.round(current.feelsLikeC) })}</span>
                <span className="inline-flex items-center gap-1">
                  <Icon name="drop" size={13} />
                  <span className="num">{t('hero.rainToday', { p: Math.round(todayRain ?? current.rainProb) })}</span>
                </span>
              </div>
            </div>
            <span className="flex h-[84px] w-[84px] flex-none items-center justify-center rounded-full bg-white/55 backdrop-blur-sm">
              <WeatherIcon condition={current.condition} size={50} />
            </span>
          </div>
        ) : (
          <div className="mt-2 text-[16px] text-ink-2">{t('hero.noWeather')}</div>
        )}
        {season ? <SeasonBar s={season} /> : null}
      </div>
    </section>
  )
}
