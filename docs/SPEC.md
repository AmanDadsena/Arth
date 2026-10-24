# Arth — अर्थ · Project spec

Arth is a mobile-first PWA that helps small farmers in Maharashtra decide what to do today:
weather-aware work, mandi prices and when to sell, crop disease photos, pesticide labels,
government documents and schemes. English, Hindi, Marathi. AI is Gemma 4 (vision, native
audio, function calling) via the Gemini API, with a private mode on a local open-weight Gemma.

Design comes from the sister project **Rutu** (https://github.com/rushii23-dev/Project-Rutu):
same tokens, fonts, cards and bottom nav. The Login screen is the only new design.

---

## 1. Repo layout & ownership

| Path | Owner |
|---|---|
| `frontend/src/app/`, `src/lib/`, `src/components/ui/`, `src/i18n/` (common ns), `src/features/auth/`, `src/features/onboarding/`, `src/features/profile/` | Frontend lead |
| `frontend/src/features/brief/`, `features/weather/` | Home agent |
| `frontend/src/features/mandi/` | Market agent |
| `frontend/src/features/doctor/`, `features/label/`, `features/kagaz/` | Vision agent |
| `frontend/src/features/calendar/`, `features/schemes/` | Planner agent |
| `frontend/src/components/voice/` | Voice agent |
| `backend/` | AWS team |

Feature agents never edit `components/ui` or `lib/api`; they request changes in their report.
i18n keys go under the feature's own namespace (e.g. `mandi.sellNow`) in `en/hi/mr.json`.

## 2. Frontend stack

Vite + React 19 + TypeScript (strict), Tailwind v4 (`@theme` tokens from Rutu), react-router-dom 7,
TanStack Query, react-i18next, vite-plugin-pwa, Recharts, browser-image-compression.

Env (`frontend/.env.local`, never committed):

```
VITE_API_BASE_URL=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

**Sign-in:** Google sign-in (Firebase Auth) is the only way in. `features/auth/AuthProvider.tsx`
registers the Firebase ID-token getter with `src/lib/session.ts` and the API client attaches it as
`Authorization: Bearer <token>`. There is no demo mode, no mock API and no sample data: every
screen is served by the backend with live data.

## 3. API contract

Base URL `VITE_API_BASE_URL`. Every request: `Authorization: Bearer <Firebase ID token>`.
The backend takes the user ID **only** from the verified JWT `sub`. JSON uses camelCase.
Dates are ISO `YYYY-MM-DD`, timestamps ISO 8601 UTC. Money in ₹ (integers), prices ₹/quintal.

Errors (any non-2xx): `{ "error": { "code": string, "message": string } }`.
401 → frontend signs out. 404 on `GET /farmer/me` → no profile yet (go to onboarding).

### Shared types

```ts
type Lang = 'en' | 'hi' | 'mr'
type Season = 'kharif' | 'rabi' | 'zaid'
type SoilType = 'black' | 'red' | 'alluvial' | 'laterite' | 'sandy' | 'clay'
type Irrigation = 'rainfed' | 'drip' | 'sprinkler' | 'canal' | 'borewell'
type Priority = 'high' | 'medium' | 'low'
```

### Farmer profile

```ts
interface FarmerProfile {
  name: string
  lang: Lang
  village: string
  district: string
  state: string            // 'Maharashtra'
  lat: number              // rounded to 2 decimals
  lon: number              // rounded to 2 decimals
  crops: string[]          // commodity ids: 'onion' | 'soybean' | 'tomato' | 'grapes' | 'cotton' | 'wheat' | ...
  landAcres: number
  soilType: SoilType       // never asked: filled from the district (Soil Health Card / soil map)
  soilSource?: 'auto' | 'farmer' // 'farmer' = corrected in Settings and kept as given
  irrigation: Irrigation   // main source; with several, the most controlled (drip > sprinkler > borewell > canal > rainfed)
  waterSources?: Irrigation[] // every source the farmer uses (onboarding is multi-choice); older profiles lack it
  tankSizeLitres: number   // sprayer tank, usually 15 or 16
  consentAt: string | null // ISO timestamp the farmer agreed to the privacy notice
  // optional "basic questions" asked right after sign-in
  experienceYears?: number
  landOwnership?: 'own' | 'lease' | 'both'
  farmingType?: 'conventional' | 'organic' | 'mixed'
  goals?: string[]         // 'more_yield' | 'better_price' | 'less_cost' | 'save_water' | 'schemes' | 'organic'
  sellsAt?: string[]       // 'mandi' | 'trader' | 'fpo' | 'direct' | 'contract'
  livestock?: string[]     // 'cow' | 'buffalo' | 'goat' | 'poultry' | 'none'
  onboardedVersion?: number // onboarding questions version answered; below the current one the app asks again
  createdAt?: string
  updatedAt?: string
}
type FarmerProfileInput = Omit<FarmerProfile, 'createdAt' | 'updatedAt'>
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/farmer/me` | – | `FarmerProfile` (404 if none) |
| PUT | `/farmer/me` | `FarmerProfileInput` | `FarmerProfile` |
| DELETE | `/farmer/me` | – | `{ deleted: true }` — also deletes all history for the UID |

### Brief (home)

`GET /brief?lang=mr` → `Brief`

```ts
interface Brief {
  greeting: string               // localized, e.g. "नमस्कार रमेश"
  date: string
  location: string               // "Niphad, Nashik"
  current: CurrentWeather | null // conditions right now (same shape as Weather.current)
  weather: WeatherDay[]          // today + next 3 days
  actions: ActionItem[]          // 2–3, sorted by priority
  priceAlerts: PriceAlert[]
  inField: FieldCrop[]           // the farmer's crops and their usual stage today
  seasonNow: SeasonNow | null    // how far into the sowing season we are
  toolCalls: ToolCallLog[]       // what was called (shown on About / for judges)
}
interface FieldCrop {
  crop: string
  name: string
  phase: 'sow' | 'grow' | 'protect' | 'harvest' | 'rest'
  stage: string                  // "Rabi onion nursery"
  task: string                   // what that stage asks of the farmer
  stageFrom: string              // ISO dates of this stage, this year
  stageTo: string
  progress: number               // 0..1 through the stage
  year: { start: string; end: string; phase: FieldCrop['phase']; name: string }[] // MM-DD, whole year
}
interface SeasonNow {
  season: Season
  name: string
  progress: number               // 0..1
  daysLeft: number
  nextSeason: Season
  nextStarts: string
}
interface ActionItem {
  id: string
  type: 'spray' | 'irrigate' | 'harvest' | 'sell' | 'sow' | 'protect' | 'scheme'
  priority: Priority
  title: string
  detail: string
  source: 'weather' | 'mandi' | 'calendar'
  route: string | null           // in-app route for the CTA, e.g. '/mandi'
}
interface PriceAlert {
  commodity: string
  market: string
  modalPrice: number
  changePct: number              // vs 7 days ago, signed
  direction: 'up' | 'down' | 'flat'
}
interface ToolCallLog { name: string; args: Record<string, unknown>; ms: number }
```

### Weather

`GET /weather?lat=20.08&lon=74.11&lang=mr` → `Weather`

```ts
interface Weather {
  location: string
  current: { tempC: number; feelsLikeC: number; humidity: number; windKmh: number; rainProb: number; condition: WeatherCondition }
  daily: WeatherDay[]            // 7 days
  advisories: Advisory[]
}
type WeatherCondition = 'clear' | 'partly_cloudy' | 'cloudy' | 'rain' | 'heavy_rain' | 'thunderstorm' | 'fog'
interface WeatherDay { date: string; minC: number; maxC: number; rainProb: number; rainMm: number; windKmh: number; condition: WeatherCondition }
interface Advisory {
  id: string
  severity: 'danger' | 'warning' | 'info'
  rule: 'rain_no_spray' | 'heat_irrigate' | 'wind_no_spray' | 'other'
  title: string                  // "Don't spray tomorrow — 80% rain"
  detail: string
  date: string
}
```

### Mandi

`GET /mandi/prices?commodity=onion&lat=20.08&lon=74.11` → `MandiPrices`

```ts
interface MandiPrices {
  commodity: string
  unit: 'quintal'
  asOf: string
  markets: MarketPrice[]         // sorted by modalPrice desc
  trend: PricePoint[]            // 30 days, nearest/main market
  trendMarket: string
  changePct7d: number
}
interface MarketPrice { market: string; district: string; minPrice: number; maxPrice: number; modalPrice: number; distanceKm: number; arrivalDate: string }
interface PricePoint { date: string; modalPrice: number }
```

`POST /mandi/sell-advice` body `{ commodity, quantityQuintals, lat, lon, lang }` → `SellAdvice`

```ts
interface SellAdvice {
  recommendation: 'SELL_NOW' | 'WAIT'
  bestMarket: string
  netEarning: number             // ₹ for the whole quantity, after transport
  options: SellOption[]
  trendSlope: number             // ₹/quintal per day over last 7 days
  reasoning: string              // localized, written by Gemma
}
interface SellOption { market: string; modalPrice: number; distanceKm: number; transportCost: number; netEarning: number }
```

### AI (Gemma 4) — never cached by the service worker

All `/ai/*` are `multipart/form-data`. Images: jpeg/png/webp, ≤ 5 MB (frontend compresses to
max 1024 px). Audio: webm, ≤ 15 s. Media is processed in memory and discarded — never stored.
Every AI response includes `model: string` (e.g. `"gemma-4"`).

`POST /ai/crop-doctor` fields `image`, `lang`, `crop?` → `CropDiagnosis`

```ts
interface CropDiagnosis {
  diagnosis: string
  scientificName: string | null
  confidence: number             // 0..1
  severity: 'low' | 'medium' | 'high'
  symptoms: string[]
  treatment: { organic: string[]; chemical: string[] }
  prevention: string[]
  escalate: boolean              // true when confidence < 0.6 or unsure
  model: string
}
```

`POST /ai/label-reader` fields `image`, `lang`, `tankSizeLitres` → `LabelReading`

```ts
interface LabelReading {
  productName: string
  activeIngredient: string
  formulation: string | null     // e.g. '25% EC'
  dosePerTank: { amount: number; unit: 'ml' | 'g' } | null  // ONLY if printed on the label, scaled to tank
  tankSizeLitres: number
  waitingPeriodDays: number | null
  safety: string[]
  warnings: string[]
  confidence: number
  escalate: boolean              // true when dosePerTank is null or confidence is low
  model: string
}
```

`POST /ai/explain-document` fields `image`, `lang`, `consent=true` (400 otherwise) → `DocumentExplanation`

```ts
interface DocumentExplanation {
  docType: string                // '7/12 extract', 'Bank notice', 'Insurance letter', ...
  summary: string
  keyPoints: string[]
  deadlines: { label: string; date: string }[]
  nextSteps: string[]
  redactedFields: string[]       // e.g. ['Aadhaar', 'Bank account', 'Phone']
  model: string
}
```

`POST /ai/voice` fields `audio`, `lang`, `context` (JSON string `{ screen: string, formFields?: string[] }`) → `VoiceResponse`

```ts
interface VoiceResponse {
  transcript: string
  reply: string
  intent: 'navigate' | 'question' | 'fill_form' | 'unknown'
  navigateTo: string | null      // in-app route
  slots: Record<string, string>  // form field → value when intent = fill_form
  escalate: boolean
  model: string
}
```

### Calendar

`GET /calendar?lang=mr[&season=rabi]` → `CalendarResponse`. Without `season` the backend uses
today's season (IST). Soil and irrigation come from the profile; kharif windows follow the
district's monsoon onset (IMD 1985–2025); rabi and summer windows are calendar dates.

```ts
interface CalendarResponse {
  season: Season                 // the season shown
  today: string
  currentSeason: Season | null   // today's season
  seasonNow: SeasonNow | null
  seasons: { season: Season; name: string; start: string; end: string }[] // MM-DD, for the year map
  onset: {                       // the district's expected monsoon onset this year
    district: string; expected: string; oldDate: string; shiftDays: number; significant: boolean; years: string
  } | null
  inField: FieldCrop[]
  recommendations: CropRecommendation[] // best fit first; open windows before upcoming ones
}
interface CropRecommendation {
  crop: string
  name: string                   // localized
  suitability: 'high' | 'medium' | 'low'
  sowingWindow: { from: string; to: string }
  windowBasis: 'onset' | 'calendar'
  status: { phase: 'open' | 'upcoming'; days: number } // days left, or days until it opens
  durationDays: number
  why: string
  whyNow: {                      // why this crop, now (null when there is no signal)
    weather: string[]            // from the live forecast, e.g. "Dry week ahead: sow soon…"
    market: string[]             // from live mandi prices, e.g. "Gram ₹5,600/quintal at Lasalgaon, up 4%"
    soil: string[]               // from district Soil Health Card results / monsoon onset
    news: { headline: string; source: string; url: string; date: string }[] // real, dated, sourced
  } | null
  timeline: { week: number; title: string; tasks: string[] }[]
}
```

### Soil (from location, never asked)

`GET /soil?lang=mr[&lat=20.08&lon=74.11&district=Nashik]` → `SoilReport`. With a point (used in
onboarding before a profile exists) the nearest Maharashtra district; without one, the saved farm.
404 `outside_maharashtra` when the point is in no district.

```ts
interface SoilReport {
  district: string
  districtLocal: string          // in the farmer's script
  soilType: SoilType             // dominant soil of the district
  basis: 'district'
  cycle: string | null           // Soil Health Card testing cycle, e.g. "2025-26"
  samples: number
  nitrogen, phosphorus, potassium, organicCarbon: { low: number; medium: number; high: number } | null
  deficient: Record<'sulphur' | 'zinc' | 'boron' | 'iron', number> // share of samples deficient
  tips: string[]                 // localized; the last one always says these are district odds
  source: string                 // Soil Health Card dashboard URL
}
```

### Schemes

`POST /schemes/match` body `{ answers: SchemeAnswers, lang }` → `{ schemes: SchemeResult[] }`

```ts
interface SchemeAnswers {
  ownsLand: boolean
  landAcres: number
  category: 'general' | 'obc' | 'sc' | 'st'
  hasBankAccount: boolean
  hasAadhaar: boolean
  isWoman: boolean
  irrigation: Irrigation
  incomeTaxPayer: boolean
}
interface SchemeResult {
  id: string                     // 'pm-kisan', 'pmfby', 'kcc', 'pmksy', 'soil-health-card', 'mahadbt-farm-mech', ...
  name: string
  eligible: boolean
  reasons: string[]
  benefit: string
  documents: string[]
  officialUrl: string
}
```

## 4. Login screen (the one redesign)

The most polished screen in the app, in Rutu's palette and fonts.

- Full-height dawn gradient (cream → soft saffron → pale green at the horizon).
- 3 layered SVG hills (parallax depths of `grow` greens), fields hinted with thin furrow lines.
- A rising sun behind the hills (slow translate + glow). Static under `prefers-reduced-motion`.
- Wordmark **Arth** with **अर्थ** beneath in Tiro display; a crossfading tagline cycling
  en / hi / mr every ~3 s (static under reduced motion).
- Language chips (मराठी · हिंदी · English) — picking one sets the app language.
- Trust chips: "🔒 Photos never stored", "🗑️ Delete anytime", "🇮🇳 Made for Maharashtra".
- Official Google sign-in button (white, Google "G" mark, per brand guidelines).
- Footer link "Privacy Notice" opening a bottom sheet (what we store / never store / 30-day delete).
- Must look right at 360 px and 414 px widths.

Flow: `/login` → first sign-in → `/consent` → `/onboarding` (6 questions: language, name, place,
crops, land, water; soil is shown, not asked) → `/`. Profile → `/settings` for everything else.

## 5. Security & privacy rules

1. Auth is Firebase Google sign-in only. API Gateway JWT authorizer: issuer
   `https://securetoken.google.com/<FIREBASE_PROJECT_ID>`, audience `<FIREBASE_PROJECT_ID>`.
2. UID only from verified JWT claims — never from the body or query.
3. No S3 / no storage of photos or audio. Processed in memory, discarded.
4. PII redaction (Aadhaar, PAN, IFSC, bank account, phone, email) on any text before it is
   sent to Gemma, logged, returned or stored. Documents return `redactedFields`.
5. Gemma never receives name, email, phone, UID or address — only crop, district, season,
   numbers and the media itself.
6. History stores only redacted summaries, with a 30-day TTL (`expiresAt`).
7. `DELETE /farmer/me` removes the profile and all history; the frontend then deletes the
   Firebase user and clears TanStack Query cache + localStorage.
8. Coordinates rounded to 2 decimals (~1 km) on the client and the server.
9. Logs never contain bodies, tokens or PII. CloudWatch retention 7 days.
10. CORS only for the Amplify domain and `http://localhost:5173`. Throttle 10 rps, burst 20.
11. Frontend secrets: only `VITE_FIREBASE_*` (public by design). Gemini key lives in SSM.
12. Service worker never caches `/ai/*` or anything containing personal documents.
13. Headers: CSP (self, Firebase auth, Google APIs, our API), X-Frame-Options DENY,
    Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy camera/microphone/
    geolocation self only.

## 6. UX rules

- 360 px first, tap targets ≥ 48 px, icons + short text.
- Every screen has loading (skeleton), error-with-retry, empty and escalate states.
- Escalate = Kisan Call Centre **1800-180-1551** (`tel:18001801551`).
- AI results show a subtle "Analyzed by Gemma 4" tag.
- Never guess a pesticide dose.
