import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Chip, Icon, IconButton } from '@/components/ui'
import { round2, useFarmer, useSaveFarmer } from '@/lib/api/queries'
import type { FarmerProfileInput, Irrigation, Lang, SoilType } from '@/lib/api/types'
import { LANGS, useLang } from '@/i18n'
import { useAuth } from '@/features/auth/useAuth'
import { getLocalConsent } from '@/features/auth/AuthProvider'

/**
 * Three short steps — language, where, the farm — saved with PUT /farmer/me.
 * `?edit=1` reuses the same steps from Profile and returns there.
 */

const CROPS = ['onion', 'soybean', 'tomato', 'grapes', 'cotton', 'wheat', 'gram', 'sugarcane', 'pomegranate', 'maize']
const SOILS: SoilType[] = ['black', 'red', 'alluvial', 'laterite', 'sandy', 'clay']
const WATER: Irrigation[] = ['rainfed', 'drip', 'sprinkler', 'canal', 'borewell']
const TANKS = [10, 12, 15, 16, 20]

/** District centres, used when the farmer types a district instead of sharing location. */
const DISTRICTS: Record<string, [number, number]> = {
  Nashik: [20.0, 73.79],
  Pune: [18.52, 73.86],
  Ahmednagar: [19.09, 74.74],
  'Chhatrapati Sambhajinagar': [19.88, 75.34],
  Jalgaon: [21.0, 75.56],
  Dhule: [20.9, 74.77],
  Solapur: [17.66, 75.91],
  Satara: [17.68, 74.0],
  Sangli: [16.85, 74.58],
  Kolhapur: [16.7, 74.24],
  Latur: [18.4, 76.57],
  Beed: [18.99, 75.76],
  Jalna: [19.84, 75.88],
  Amravati: [20.93, 77.75],
  Akola: [20.7, 77.0],
  Nagpur: [21.15, 79.09],
}

const FIELD = 'h-[60px] w-full rounded-[24px] bg-card px-5 text-[19px] font-medium text-ink outline-none placeholder:text-hint focus-visible:ring-2 focus-visible:ring-grow'

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 mt-6 px-1 text-[13px] font-semibold uppercase tracking-[1.4px] text-faint">{children}</div>
}

type GeoState = 'idle' | 'locating' | 'ok' | 'denied'

export default function OnboardingPage() {
  const { t } = useTranslation('onboarding')
  const { t: tc } = useTranslation('common')
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editing = params.get('edit') === '1'
  const { displayName } = useAuth()
  const { lang, setLang } = useLang()
  const existing = useFarmer().data
  const save = useSaveFarmer()

  const [step, setStep] = useState(0)
  const [p, setP] = useState<Omit<FarmerProfileInput, 'lang' | 'consentAt'>>(() => ({
    name: existing?.name ?? displayName,
    village: existing?.village ?? '',
    district: existing?.district ?? 'Nashik',
    state: 'Maharashtra',
    lat: existing?.lat ?? DISTRICTS.Nashik![0],
    lon: existing?.lon ?? DISTRICTS.Nashik![1],
    crops: existing?.crops ?? [],
    landAcres: existing?.landAcres ?? 2,
    soilType: existing?.soilType ?? 'black',
    irrigation: existing?.irrigation ?? 'rainfed',
    tankSizeLitres: existing?.tankSizeLitres ?? 15,
  }))
  const [geo, setGeo] = useState<GeoState>(existing ? 'ok' : 'idle')
  const [failed, setFailed] = useState(false)
  const set = (patch: Partial<typeof p>) => setP((cur) => ({ ...cur, ...patch }))

  function locate() {
    if (!('geolocation' in navigator)) return setGeo('denied')
    setGeo('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // ~1 km: enough for weather and mandis, not enough to find a house
        set({ lat: round2(pos.coords.latitude), lon: round2(pos.coords.longitude) })
        setGeo('ok')
      },
      () => setGeo('denied'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    )
  }

  function pickDistrict(d: string) {
    const c = DISTRICTS[d]
    // a typed district only moves the point if the farmer hasn't shared a location
    set(c && geo !== 'ok' ? { district: d, lat: c[0], lon: c[1] } : { district: d })
  }

  const canNext = step === 0 || (step === 1 ? p.name.trim() && p.village.trim() && p.district.trim() : p.crops.length > 0 && p.landAcres > 0)

  async function finish() {
    setFailed(false)
    try {
      await save.mutateAsync({
        ...p,
        name: p.name.trim(),
        village: p.village.trim(),
        lang,
        lat: round2(p.lat),
        lon: round2(p.lon),
        consentAt: existing?.consentAt ?? getLocalConsent() ?? new Date().toISOString(),
      })
      nav(editing ? '/profile' : '/', { replace: true })
    } catch {
      setFailed(true)
    }
  }

  const next = () => (step === 2 ? void finish() : setStep(step + 1))
  const back = () => (step === 0 ? nav(editing ? '/profile' : '/consent', { replace: true }) : setStep(step - 1))

  return (
    <div className="flex min-h-full flex-col px-5 pb-8 pt-[max(16px,env(safe-area-inset-top))]">
      <div className="flex items-center gap-3.5">
        <IconButton icon="back" label={tc('back')} onClick={back} />
        <div className="flex flex-1 gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-sm ${i <= step ? 'bg-grow' : 'bg-track'}`} />
          ))}
        </div>
        <div className="num flex-none text-sm font-semibold text-faint">{t('step', { n: step + 1, total: 3 })}</div>
      </div>

      <div className="flex-1 pt-8">
        {step === 0 && (
          <>
            <h1 className="display text-[32px] leading-tight text-ink">{t('langTitle')}</h1>
            <p className="mt-2 text-[16px] text-muted">{t('langSub')}</p>
            <div className="mt-7 space-y-2.5" role="radiogroup">
              {LANGS.map((l) => {
                const on = l.code === lang
                return (
                  <button
                    key={l.code}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    lang={l.code}
                    onClick={() => setLang(l.code as Lang)}
                    className={`flex h-[68px] w-full items-center justify-between rounded-[26px] px-6 text-[22px] font-semibold transition ${on ? 'bg-grow text-white' : 'bg-card text-ink'}`}
                  >
                    {l.label}
                    {on ? <Icon name="check" /> : null}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="display text-[32px] leading-tight text-ink">{t('whereTitle')}</h1>
            <p className="mt-2 text-[16px] text-muted">{t('whereSub')}</p>

            <button
              type="button"
              onClick={locate}
              disabled={geo === 'locating'}
              className={`mt-6 flex min-h-[60px] w-full items-center gap-3 rounded-[24px] px-5 text-left text-[17px] font-semibold ${geo === 'ok' ? 'bg-grow-l text-grow-d' : 'bg-ink text-white'}`}
            >
              <Icon name={geo === 'ok' ? 'check' : 'pin'} />
              {geo === 'locating' ? t('locating') : geo === 'ok' ? t('locationOk') : t('useLocation')}
            </button>
            {geo === 'denied' ? <p className="mt-2 px-1 text-[14px] font-medium text-warn-d">{t('locationDenied')}</p> : null}

            <Label>{t('name')}</Label>
            <input className={FIELD} value={p.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" />
            <Label>{t('village')}</Label>
            <input className={FIELD} value={p.village} onChange={(e) => set({ village: e.target.value })} placeholder="Niphad" />
            <Label>{t('district')}</Label>
            <select className={`${FIELD} appearance-none`} value={p.district} onChange={(e) => pickDistrict(e.target.value)}>
              {Object.keys(DISTRICTS).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="display text-[32px] leading-tight text-ink">{t('farmTitle')}</h1>
            <p className="mt-2 text-[16px] text-muted">{t('farmSub')}</p>

            <Label>{t('crops')}</Label>
            <div className="flex flex-wrap gap-2">
              {CROPS.map((c) => (
                <Chip key={c} selected={p.crops.includes(c)} onClick={() => set({ crops: p.crops.includes(c) ? p.crops.filter((x) => x !== c) : [...p.crops, c] })}>
                  {tc(`crops.${c}`)}
                </Chip>
              ))}
            </div>

            <Label>{t('land')}</Label>
            <div className="flex items-center gap-3 rounded-[24px] bg-card p-2">
              <button type="button" aria-label="−" onClick={() => set({ landAcres: Math.max(0.5, round2(p.landAcres - 0.5)) })} className="h-12 w-12 rounded-[20px] bg-chip text-[24px] font-semibold text-ink">
                −
              </button>
              <div className="flex-1 text-center">
                <span className="num text-[26px] font-semibold text-ink">{p.landAcres}</span> <span className="text-[15px] text-faint">{tc('units.acres')}</span>
              </div>
              <button type="button" aria-label="+" onClick={() => set({ landAcres: round2(p.landAcres + 0.5) })} className="h-12 w-12 rounded-[20px] bg-chip text-[24px] font-semibold text-ink">
                +
              </button>
            </div>

            <Label>{t('soil')}</Label>
            <div className="flex flex-wrap gap-2">
              {SOILS.map((s) => (
                <Chip key={s} selected={p.soilType === s} onClick={() => set({ soilType: s })}>
                  {tc(`soil.${s}`)}
                </Chip>
              ))}
            </div>

            <Label>{t('irrigation')}</Label>
            <div className="flex flex-wrap gap-2">
              {WATER.map((w) => (
                <Chip key={w} selected={p.irrigation === w} onClick={() => set({ irrigation: w })}>
                  {tc(`irrigation.${w}`)}
                </Chip>
              ))}
            </div>

            <Label>{t('tank')}</Label>
            <div className="flex flex-wrap gap-2">
              {TANKS.map((n) => (
                <Chip key={n} selected={p.tankSizeLitres === n} onClick={() => set({ tankSizeLitres: n })}>
                  <span className="num">{n}</span> {tc('units.litres')}
                </Chip>
              ))}
            </div>
            <p className="mt-2 px-1 text-[13px] text-faint">{t('tankHint')}</p>
          </>
        )}
      </div>

      <div className="pt-8">
        {failed ? <p className="mb-2 text-center text-[14px] font-semibold text-warn-d">{t('saveFailed')}</p> : null}
        <Button disabled={!canNext} loading={save.isPending} onClick={next} icon={step === 2 ? 'check' : undefined}>
          {step === 2 ? (editing ? tc('save') : t('finish')) : tc('next')}
        </Button>
      </div>
    </div>
  )
}
