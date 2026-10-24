import type { Advisory, Lang, Weather, WeatherCondition, WeatherDay } from '@/lib/api/types'
import { getJson, liveFetch, round2, type LiveSource } from './cache'
import { addDaysIso, dayWord, todayIso } from './dates'

/**
 * Live forecast from Open-Meteo (https://open-meteo.com — free, no key, CORS
 * open). Falls back to the last cached forecast, then to a seeded one, so the
 * screens never go blank offline.
 */

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
const TTL_MS = 60 * 60_000 // 1 h
// a few spare days so a cached forecast still covers a week tomorrow
const FORECAST_DAYS = 10

type T3 = { en: string; hi: string; mr: string }
const L = (s: T3, lang: Lang) => s[lang] ?? s.en

// ---- WMO weather codes → our conditions ---------------------------------

export function conditionFromWmo(code: number, rainMm?: number): WeatherCondition {
  if (code >= 95) return 'thunderstorm'
  // a day of light drizzle adding up to under 1 mm reads as a cloudy day, not a rainy one
  if (code >= 51 && code <= 57 && rainMm !== undefined && rainMm < 1) return 'cloudy'
  if (code === 65 || code === 67 || code === 82 || code === 75 || code === 86) return 'heavy_rain'
  if (code >= 51) return (rainMm ?? 0) >= 25 ? 'heavy_rain' : 'rain' // drizzle, rain, showers (snow never in MH)
  if (code === 45 || code === 48) return 'fog'
  if (code === 3) return 'cloudy'
  if (code === 2) return 'partly_cloudy'
  return 'clear' // 0 clear, 1 mainly clear
}

// ---- seeded fallback -----------------------------------------------------

const SEED_RAIN = [20, 80, 65, 30, 10, 5, 15]
const SEED_COND: WeatherCondition[] = ['partly_cloudy', 'rain', 'thunderstorm', 'cloudy', 'clear', 'clear', 'partly_cloudy']
const SEED_MIN = [19, 20, 20, 19, 18, 18, 19]
const SEED_MAX = [31, 27, 26, 29, 32, 33, 32]
const SEED_MM = [0.4, 14.2, 9.8, 1.1, 0, 0, 0.2]
const SEED_WIND = [11, 18, 24, 14, 9, 8, 10]

/** offline stand-in: plausible Nashik post-monsoon days starting `from` */
export function seededForecast(n = 7, from: string = todayIso()): WeatherDay[] {
  return Array.from({ length: n }, (_, i) => ({
    date: addDaysIso(from, i),
    minC: SEED_MIN[i % 7] ?? 19,
    maxC: SEED_MAX[i % 7] ?? 31,
    rainProb: SEED_RAIN[i % 7] ?? 10,
    rainMm: SEED_MM[i % 7] ?? 0,
    windKmh: SEED_WIND[i % 7] ?? 10,
    condition: SEED_COND[i % 7] ?? 'clear',
  }))
}

export const SEEDED_CURRENT: Weather['current'] = { tempC: 28, feelsLikeC: 30, humidity: 68, windKmh: 11, rainProb: 20, condition: 'partly_cloudy' }

// ---- live ----------------------------------------------------------------

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number
    apparent_temperature?: number
    relative_humidity_2m?: number
    wind_speed_10m?: number
    weather_code?: number
    precipitation_probability?: number
  }
  daily?: {
    time?: string[]
    weather_code?: (number | null)[]
    temperature_2m_max?: (number | null)[]
    temperature_2m_min?: (number | null)[]
    precipitation_probability_max?: (number | null)[]
    precipitation_sum?: (number | null)[]
    wind_speed_10m_max?: (number | null)[]
  }
}

interface Snapshot {
  current: Weather['current']
  daily: WeatherDay[]
}

const r0 = (x: number | null | undefined, fallback = 0) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : fallback)
const r1 = (x: number | null | undefined) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10) / 10 : 0)

function parse(j: OpenMeteoResponse): Snapshot | null {
  const d = j.daily
  if (!d?.time?.length) return null
  const daily: WeatherDay[] = d.time.map((date, i) => {
    const rainMm = r1(d.precipitation_sum?.[i])
    return {
      date,
      minC: r0(d.temperature_2m_min?.[i]),
      maxC: r0(d.temperature_2m_max?.[i]),
      rainProb: r0(d.precipitation_probability_max?.[i]),
      rainMm,
      windKmh: r0(d.wind_speed_10m_max?.[i]),
      condition: conditionFromWmo(r0(d.weather_code?.[i]), rainMm),
    }
  })
  const c = j.current ?? {}
  const today = daily[0]!
  const current: Weather['current'] = {
    tempC: r0(c.temperature_2m, today.maxC),
    feelsLikeC: r0(c.apparent_temperature, r0(c.temperature_2m, today.maxC)),
    humidity: r0(c.relative_humidity_2m, 60),
    windKmh: r0(c.wind_speed_10m, today.windKmh),
    rainProb: r0(c.precipitation_probability, today.rainProb),
    condition: typeof c.weather_code === 'number' ? conditionFromWmo(c.weather_code) : today.condition,
  }
  return { current, daily }
}

export interface LiveWeather extends Snapshot {
  source: LiveSource | 'seeded'
  /** epoch ms of the fetch (seeded: now) */
  at: number
  /** ms the lookup took */
  ms: number
}

/** current conditions + `days` daily days from today: live → cached → seeded */
export async function getLiveWeather(lat: number, lon: number, days = 7): Promise<LiveWeather> {
  const t0 = performance.now()
  const la = round2(lat)
  const lo = round2(lon)
  const url =
    `${OPEN_METEO}?latitude=${la}&longitude=${lo}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,precipitation_probability' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max' +
    `&timezone=Asia%2FKolkata&forecast_days=${FORECAST_DAYS}`
  const res = await liveFetch<Snapshot>(`weather.${la},${lo}`, TTL_MS, async () => parse(await getJson<OpenMeteoResponse>(url)))
  const ms = Math.round(performance.now() - t0)
  const today = todayIso()

  if (!res) return { current: SEEDED_CURRENT, daily: seededForecast(days, today), source: 'seeded', at: Date.now(), ms }

  // a cached forecast from an earlier day: drop the days already gone, pad the end
  let daily = res.data.daily.filter((d) => d.date >= today).slice(0, days)
  if (!daily.length) return { current: SEEDED_CURRENT, daily: seededForecast(days, today), source: 'seeded', at: Date.now(), ms }
  if (daily.length < days) {
    const last = daily[daily.length - 1]!.date
    daily = [...daily, ...seededForecast(days - daily.length, addDaysIso(last, 1))]
  }
  const stale = daily[0]!.date !== res.data.daily[0]!.date
  const current = stale ? { ...res.data.current, rainProb: daily[0]!.rainProb, condition: daily[0]!.condition } : res.data.current
  return { current, daily, source: res.source, at: res.at, ms }
}

/** `days` forecast days from today for any screen (calendar insights too) */
export async function getForecast(lat: number, lon: number, days = 7): Promise<WeatherDay[]> {
  return (await getLiveWeather(lat, lon, days)).daily
}

// ---- advisories (SPEC rules) --------------------------------------------

export const RAIN_NO_SPRAY_PCT = 60
export const HEAT_IRRIGATE_C = 38
export const WIND_NO_SPRAY_KMH = 20

export function advisories(days: WeatherDay[], lang: Lang, today: string = todayIso()): Advisory[] {
  const out: Advisory[] = []
  const word = (date: string, l: Lang) => dayWord(date, l, today)
  for (const d of days.slice(0, 4)) {
    if (d.rainProb > RAIN_NO_SPRAY_PCT) {
      out.push({
        id: `rain-${d.date}`,
        severity: d.rainProb >= 80 ? 'danger' : 'warning',
        rule: 'rain_no_spray',
        date: d.date,
        title: L(
          {
            en: `Don't spray ${word(d.date, 'en')} — ${d.rainProb}% rain`,
            hi: `${word(d.date, 'hi')} छिड़काव न करें — ${d.rainProb}% बारिश`,
            mr: `${word(d.date, 'mr')} फवारणी करू नका — ${d.rainProb}% पाऊस`,
          },
          lang,
        ),
        detail: L(
          {
            en: 'Rain will wash the spray off the leaves. Spray after the rain stops and leaves dry.',
            hi: 'बारिश से दवा पत्तों से धुल जाएगी। बारिश रुकने और पत्ते सूखने के बाद छिड़काव करें।',
            mr: 'पावसाने औषध पानांवरून धुऊन जाईल. पाऊस थांबून पाने सुकल्यावर फवारणी करा.',
          },
          lang,
        ),
      })
    }
    if (d.windKmh > WIND_NO_SPRAY_KMH) {
      out.push({
        id: `wind-${d.date}`,
        severity: 'info',
        rule: 'wind_no_spray',
        date: d.date,
        title: L(
          {
            en: `Strong wind ${word(d.date, 'en')} — ${d.windKmh} km/h, avoid spraying`,
            hi: `${word(d.date, 'hi')} तेज़ हवा ${d.windKmh} किमी/घंटा — छिड़काव टालें`,
            mr: `${word(d.date, 'mr')} जोराचा वारा ${d.windKmh} किमी/तास — फवारणी टाळा`,
          },
          lang,
        ),
        detail: L(
          { en: 'Spray drifts away in wind and can reach you or the next field.', hi: 'हवा में दवा उड़कर आप पर या पड़ोसी खेत में जा सकती है।', mr: 'वाऱ्यात औषध उडून तुमच्यावर किंवा शेजारच्या शेतात जाऊ शकते.' },
          lang,
        ),
      })
    }
    if (d.maxC > HEAT_IRRIGATE_C) {
      out.push({
        id: `heat-${d.date}`,
        severity: 'danger',
        rule: 'heat_irrigate',
        date: d.date,
        title: L(
          {
            en: `Very hot ${word(d.date, 'en')} (${d.maxC}°C) — irrigate in the evening`,
            hi: `${word(d.date, 'hi')} बहुत गर्मी (${d.maxC}°C) — शाम को सिंचाई करें`,
            mr: `${word(d.date, 'mr')} खूप उष्ण (${d.maxC}°C) — संध्याकाळी पाणी द्या`,
          },
          lang,
        ),
        detail: L({ en: 'Evening water is not lost to the afternoon sun.', hi: 'शाम का पानी दोपहर की धूप में नहीं उड़ता।', mr: 'संध्याकाळचे पाणी दुपारच्या उन्हात उडून जात नाही.' }, lang),
      })
    }
  }
  if (!out.length && days[0]) {
    const d = days[0]
    out.push({
      id: `calm-${d.date}`,
      severity: 'info',
      rule: 'other',
      date: d.date,
      title: L(
        {
          en: 'No weather risk in the next 4 days',
          hi: 'अगले 4 दिन मौसम से कोई खतरा नहीं',
          mr: 'पुढील 4 दिवस हवामानाचा धोका नाही',
        },
        lang,
      ),
      detail: L(
        {
          en: `Rain chance ${d.rainProb}% today, wind ${d.windKmh} km/h. Good days for spraying and field work — spray in the morning or after 4 pm.`,
          hi: `आज बारिश की संभावना ${d.rainProb}%, हवा ${d.windKmh} किमी/घंटा। छिड़काव और खेत के काम के लिए अच्छे दिन — सुबह या शाम 4 बजे के बाद छिड़कें।`,
          mr: `आज पावसाची शक्यता ${d.rainProb}%, वारा ${d.windKmh} किमी/तास. फवारणी व शेतकामासाठी चांगले दिवस — सकाळी किंवा दुपारी 4 नंतर फवारा.`,
        },
        lang,
      ),
    })
  }
  return out
}
