import type { FarmerProfile, FarmerProfileInput, Lang, MandiPrices, SchemeAnswers, Season, SellAdviceRequest, ToolCallLog, VoiceContext } from '@/lib/api/types'
import { DEMO_FARMER, isDemo } from '@/lib/demo'
import { getLiveHistory, getLiveMandi, hasLiveMandi, peekLiveMandi } from '@/lib/live/mandi'
import { getLiveWeather } from '@/lib/live/weather'
import { whyNowFor } from './calendarInsights'
import * as data from './data'

/**
 * One resolver for every endpoint, shared by demo mode (called in-process by
 * the API client) and by the MSW handlers in dev. Returns a real Response so
 * both paths go through the same error handling in the client.
 *
 * Weather and mandi prices are fetched live from public sources (Open-Meteo,
 * data.gov.in) with a cached → seeded fallback, see src/lib/live.
 */

const PROFILE_KEY = () => (isDemo() ? 'arth.demo.profile' : 'arth.mock.profile')

function readProfile(): FarmerProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY())
    if (raw) return JSON.parse(raw) as FarmerProfile
  } catch {
    /* fall through */
  }
  return isDemo() ? DEMO_FARMER : null
}

function writeProfile(p: FarmerProfile | null) {
  try {
    if (p) localStorage.setItem(PROFILE_KEY(), JSON.stringify(p))
    else localStorage.removeItem(PROFILE_KEY())
  } catch {
    /* storage blocked */
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const error = (status: number, code: string, message: string) => json({ error: { code, message } }, status)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const asLang = (v: unknown): Lang => (v === 'en' || v === 'hi' || v === 'mr' ? v : 'mr')
const num = (v: unknown, fallback: number) => {
  const n = Number(v)
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback
}

function field(body: unknown, key: string): unknown {
  if (body instanceof FormData) return body.get(key)
  if (body && typeof body === 'object') return (body as Record<string, unknown>)[key]
  return undefined
}

/**
 * live (or cached, or seeded) MandiPrices for one commodity, with the trend
 * market's real past prices. `cacheOnly` never makes a request.
 */
async function prices(commodity: string, lat: number, lon: number, district?: string, cacheOnly = false): Promise<{ prices: MandiPrices; log: ToolCallLog; live: boolean }> {
  const t0 = performance.now()
  const live = cacheOnly ? peekLiveMandi(commodity, district) : await getLiveMandi(commodity, district)
  const rec = data.trendRecord(commodity, lat, lon, live)
  const history = rec ? await getLiveHistory(commodity, rec, cacheOnly) : null
  return {
    prices: data.mandiPrices(commodity, lat, lon, live, history),
    live: !!live?.records.length,
    log: {
      name: 'get_mandi_prices',
      args: { commodity, state: 'Maharashtra', source: live ? `data.gov.in (${live.source})` : 'seeded', historyDays: history ? Object.keys(history).length : 0 },
      ms: Math.round(performance.now() - t0),
    },
  }
}

// commodities the calendar reads 7-day price changes for
const INSIGHT_CROPS = ['onion', 'soybean', 'tomato', 'grapes', 'wheat', 'gram']

export async function resolveMock(method: string, pathWithQuery: string, body?: unknown): Promise<Response> {
  const url = new URL(pathWithQuery, 'http://mock.local')
  const path = url.pathname.replace(/^\/api/, '')
  const q = url.searchParams
  const profile = readProfile()
  const farmer = profile ?? DEMO_FARMER
  const lat = num(q.get('lat'), farmer.lat)
  const lon = num(q.get('lon'), farmer.lon)
  const district = farmer.district

  // AI calls are slow on purpose so loading states are visible; live data needs no delay
  if (path.startsWith('/ai/')) await wait(1500)

  const route = `${method.toUpperCase()} ${path}`
  switch (route) {
    case 'GET /farmer/me':
      return profile ? json(profile) : error(404, 'not_found', 'No profile yet')
    case 'PUT /farmer/me': {
      const input = body as FarmerProfileInput
      const now = new Date().toISOString()
      const saved: FarmerProfile = { ...input, createdAt: profile?.createdAt ?? now, updatedAt: now }
      writeProfile(saved)
      return json(saved)
    }
    case 'DELETE /farmer/me':
      writeProfile(null)
      return json({ deleted: true })

    case 'GET /brief': {
      const lang = asLang(q.get('lang'))
      const crops = farmer.crops?.length ? farmer.crops : ['onion']
      const priced = crops.filter(hasLiveMandi).slice(0, 3)
      const [weather, ...mandi] = await Promise.all([
        getLiveWeather(farmer.lat, farmer.lon, 7),
        ...priced.map((c) => prices(c, farmer.lat, farmer.lon, district)),
      ])
      const byCrop: Record<string, MandiPrices> = {}
      priced.forEach((c, i) => (byCrop[c] = mandi[i]!.prices))
      const toolCalls: ToolCallLog[] = [
        { name: 'get_weather', args: { district, days: 4, source: weather.source === 'seeded' ? 'seeded' : `open-meteo (${weather.source})` }, ms: weather.ms },
        ...mandi.map((m) => m.log),
        { name: 'get_crop_calendar', args: { crops: crops.slice(0, 3) }, ms: 1 },
      ]
      return json(data.brief(lang, { name: profile?.name ?? DEMO_FARMER.name, crops, weather, prices: byCrop, toolCalls }))
    }
    case 'GET /weather': {
      const lang = asLang(q.get('lang'))
      const live = await getLiveWeather(lat, lon, 7)
      return json(data.weather(lang, data.placeName(farmer.village, farmer.district, lang), live))
    }
    case 'GET /mandi/prices':
      return json((await prices(q.get('commodity') ?? 'onion', lat, lon, district)).prices)
    case 'POST /mandi/sell-advice': {
      const req = body as SellAdviceRequest
      const r: SellAdviceRequest = {
        ...req,
        lat: num(req?.lat, farmer.lat),
        lon: num(req?.lon, farmer.lon),
        quantityQuintals: num(req?.quantityQuintals, 10),
        lang: asLang(req?.lang),
        commodity: req?.commodity || 'onion',
      }
      return json(data.sellAdvice(r, (await prices(r.commodity, r.lat, r.lon, district)).prices))
    }

    case 'POST /ai/crop-doctor': {
      if (!field(body, 'image')) return error(400, 'missing_image', 'image is required')
      const crop = field(body, 'crop')
      return json(data.cropDoctor(asLang(field(body, 'lang')), typeof crop === 'string' ? crop : undefined))
    }
    case 'POST /ai/label-reader': {
      const image = field(body, 'image')
      if (!image) return error(400, 'missing_image', 'image is required')
      // a file named "*blur*" demos the escalate path (no dose is ever guessed)
      const unreadable = image instanceof File && /blur/i.test(image.name)
      return json(data.labelReader(asLang(field(body, 'lang')), Number(field(body, 'tankSizeLitres') ?? 15), unreadable))
    }
    case 'POST /ai/explain-document':
      if (String(field(body, 'consent')) !== 'true') return error(400, 'consent_required', 'consent=true is required')
      if (!field(body, 'image')) return error(400, 'missing_image', 'image is required')
      return json(data.explainDocument(asLang(field(body, 'lang'))))
    case 'POST /ai/voice': {
      let ctx: VoiceContext = { screen: 'home' }
      try {
        ctx = JSON.parse(String(field(body, 'context') ?? '{}')) as VoiceContext
      } catch {
        /* default context */
      }
      // quote the onion price the farmer last saw (cached), never wait on the network here
      const onion = (await prices('onion', farmer.lat, farmer.lon, district, true)).prices
      const m = data.headlinePrice(onion)
      return json(data.voice(asLang(field(body, 'lang')), ctx, m ? { market: m.market, modalPrice: m.modalPrice, changePct: onion.changePct7d } : undefined))
    }

    case 'GET /calendar': {
      const s = q.get('season')
      const season: Season = s === 'kharif' || s === 'zaid' ? s : 'rabi'
      const lang = asLang(q.get('lang'))
      const cal = data.calendar(season, lang)
      // fetch prices for this season's crops; the rest only if already cached (rate limits)
      const wanted = new Set(cal.recommendations.map((r) => r.crop))
      const [weather, ...mandi] = await Promise.all([
        getLiveWeather(farmer.lat, farmer.lon, 7),
        ...INSIGHT_CROPS.map((c) => prices(c, farmer.lat, farmer.lon, district, !wanted.has(c))),
      ])
      const priceChangePct: Record<string, number> = {}
      INSIGHT_CROPS.forEach((c, i) => {
        const m = mandi[i]
        if (m?.live) priceChangePct[c] = m.prices.changePct7d
      })
      const recommendations = cal.recommendations.map((rec) => {
        try {
          return { ...rec, whyNow: whyNowFor(rec.crop, season, lang, { forecast: weather.daily, priceChangePct }) }
        } catch {
          return rec // insights are extra; the calendar still renders without them
        }
      })
      return json({ ...cal, recommendations })
    }
    case 'POST /schemes/match': {
      const b = body as { answers: SchemeAnswers; lang: Lang }
      return json(data.matchSchemes(b.answers, asLang(b.lang)))
    }
  }
  return error(404, 'no_route', `No mock for ${route}`)
}
