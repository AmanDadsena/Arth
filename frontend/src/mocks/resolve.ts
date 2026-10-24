import type { FarmerProfile, FarmerProfileInput, Lang, SchemeAnswers, Season, SellAdviceRequest, VoiceContext } from '@/lib/api/types'
import { DEMO_FARMER, isDemo } from '@/lib/demo'
import * as data from './data'

/**
 * One resolver for every endpoint, shared by demo mode (called in-process by
 * the API client) and by the MSW handlers in dev. Returns a real Response so
 * both paths go through the same error handling in the client.
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

function field(body: unknown, key: string): unknown {
  if (body instanceof FormData) return body.get(key)
  if (body && typeof body === 'object') return (body as Record<string, unknown>)[key]
  return undefined
}

export async function resolveMock(method: string, pathWithQuery: string, body?: unknown): Promise<Response> {
  const url = new URL(pathWithQuery, 'http://mock.local')
  const path = url.pathname.replace(/^\/api/, '')
  const q = url.searchParams
  const profile = readProfile()
  const lat = Number(q.get('lat') ?? profile?.lat ?? DEMO_FARMER.lat)
  const lon = Number(q.get('lon') ?? profile?.lon ?? DEMO_FARMER.lon)

  // AI calls are slow on purpose so loading states are visible
  await wait(path.startsWith('/ai/') ? 1500 : 350)

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

    case 'GET /brief':
      return json(data.brief(asLang(q.get('lang')), profile?.name ?? DEMO_FARMER.name))
    case 'GET /weather':
      return json(data.weather(asLang(q.get('lang'))))
    case 'GET /mandi/prices':
      return json(data.mandiPrices(q.get('commodity') ?? 'onion', lat, lon))
    case 'POST /mandi/sell-advice':
      return json(data.sellAdvice(body as SellAdviceRequest))

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
      return json(data.voice(asLang(field(body, 'lang')), ctx))
    }

    case 'GET /calendar': {
      const s = q.get('season')
      const season: Season = s === 'kharif' || s === 'zaid' ? s : 'rabi'
      return json(data.calendar(season, asLang(q.get('lang'))))
    }
    case 'POST /schemes/match': {
      const b = body as { answers: SchemeAnswers; lang: Lang }
      return json(data.matchSchemes(b.answers, asLang(b.lang)))
    }
  }
  return error(404, 'no_route', `No mock for ${route}`)
}
