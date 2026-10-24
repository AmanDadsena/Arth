import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Icon } from '@/components/ui'
import { api } from '@/lib/api/client'
import { qk, round2 } from '@/lib/api/queries'
import { LANGS, useLang } from '@/i18n'
import { CROPS, DISTRICTS, WATER, districtLabel, nearestDistrict, toggle, type Draft, type QuestionDef } from './model'
import { FIELD, Label, OptionRow, OptionTile, QuestionHead } from './parts'
/** The body of one question screen. `pick` answers and moves on; `set` only answers. */
export interface QuestionProps {
  q: QuestionDef
  draft: Draft
  set: (patch: Partial<Draft>) => void
  pick: (patch: Partial<Draft>) => void
  onSubmit: () => void
}

export function QuestionBody(props: QuestionProps) {
  const { q, draft, set, pick } = props
  const { t } = useTranslation('onboarding')
  const { t: tc } = useTranslation('common')
  const head = <QuestionHead glyph={q.glyph} title={t(`q.${q.id}.title`)} why={t(`q.${q.id}.why`)} eyebrow={q.id === 'lang' ? t('welcome') : undefined} />

  switch (q.id) {
    case 'lang':
      return (
        <>
          {head}
          <LangOptions />
          <p className="mt-4 px-1 text-[14px] text-faint">{t('langSub')}</p>
        </>
      )

    case 'name':
      return (
        <>
          {head}
          <Label htmlFor="ob-name">{t('name')}</Label>
          <input
            id="ob-name"
            className={FIELD}
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && props.onSubmit()}
            autoComplete="name"
            enterKeyHint="next"
            placeholder={t('namePlaceholder')}
          />
          <PrivacyNote>{t('namePrivate')}</PrivacyNote>
        </>
      )

    case 'where':
      return (
        <>
          {head}
          <WhereFields draft={draft} set={set} />
        </>
      )

    case 'crops':
      return (
        <>
          {head}
          <MultiHint />
          <div role="group" aria-label={t(`q.${q.id}.title`)} className="mt-3 grid grid-cols-2 gap-2.5">
            {CROPS.map((c) => (
              <OptionTile key={c.value} glyph={c.glyph} label={tc(`crops.${c.value}`)} on={draft.crops.includes(c.value)} onClick={() => set({ crops: toggle(draft.crops, c.value) })} />
            ))}
          </div>
        </>
      )

    case 'land':
      return (
        <>
          {head}
          <LandStepper value={draft.landAcres} onChange={(landAcres) => set({ landAcres })} />
        </>
      )

    case 'water':
      return (
        <>
          {head}
          <Group label={t(`q.${q.id}.title`)}>
            {WATER.map((w) => (
              <OptionRow key={w.value} glyph={w.glyph} label={tc(`irrigation.${w.value}`)} hint={t(`waterHint.${w.value}`)} on={draft.irrigation === w.value} onClick={() => pick({ irrigation: w.value })} />
            ))}
          </Group>
        </>
      )

  }
}

function Group({ label, multi = false, children }: { label: string; multi?: boolean; children: ReactNode }) {
  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-label={label} className={`${multi ? 'mt-3' : 'mt-7'} space-y-2.5`}>
      {children}
    </div>
  )
}

function MultiHint() {
  const { t } = useTranslation('onboarding')
  return (
    <div className="mt-5 flex items-center gap-2 px-1 text-[14px] font-semibold text-grow">
      <Icon name="check" size={16} strokeWidth={2.6} />
      {t('multiHint')}
    </div>
  )
}

function PrivacyNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 px-1 text-[14px] leading-snug text-faint">
      <Icon name="lock" size={16} className="mt-0.5" />
      {children}
    </p>
  )
}

function LangOptions() {
  const { lang, setLang } = useLang()
  return (
    <div className="mt-7 space-y-2.5" role="radiogroup" aria-label="Language">
      {LANGS.map((l) => (
        <OptionRow key={l.code} lang={l.code} label={<span className="text-[22px]">{l.label}</span>} on={l.code === lang} onClick={() => setLang(l.code)} />
      ))}
    </div>
  )
}

type GeoState = 'idle' | 'locating' | 'denied'

/**
 * What the location already tells us, so we never ask: the district's soil and
 * how its Soil Health Card tests came out. Quiet when offline or out of state.
 */
function SoilFound({ draft }: { draft: Draft }) {
  const { t } = useTranslation('onboarding')
  const { t: tc } = useTranslation('common')
  const { lang } = useLang()
  const at = { lat: round2(draft.lat), lon: round2(draft.lon), district: draft.district }
  const q = useQuery({ queryKey: [...qk.soil(lang, at.lat, at.lon), at.district], queryFn: () => api.getSoil(lang, at), staleTime: Infinity, retry: false })
  if (!q.data) return null
  const s = q.data
  const nLow = s.nitrogen ? Math.round(s.nitrogen.low * 100) : null
  return (
    <div role="status" className="mt-4 flex items-start gap-3 rounded-[22px] bg-grow-l px-4 py-3.5">
      <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-grow text-white">
        <Icon name="sprout" size={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-[16px] font-semibold leading-snug text-grow-d">
          {t('soilFound', { soil: tc(`soil.${s.soilType}`), district: s.districtLocal })}
        </span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-2">
          {nLow !== null ? t('soilFoundBody', { n: nLow, samples: s.samples.toLocaleString('en-IN') }) : t('soilFoundNoTests')}
        </span>
      </span>
    </div>
  )
}

function WhereFields({ draft, set }: { draft: Draft; set: (patch: Partial<Draft>) => void }) {
  const { t } = useTranslation('onboarding')
  const { lang } = useLang()
  const [geo, setGeo] = useState<GeoState>('idle')

  function locate() {
    if (!('geolocation' in navigator)) return setGeo('denied')
    setGeo('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // ~1 km: enough for weather and mandis, not enough to find a house
        const lat = round2(pos.coords.latitude)
        const lon = round2(pos.coords.longitude)
        const near = nearestDistrict(lat, lon)
        set({ lat, lon, located: true, ...(near ? { district: near } : {}) })
        setGeo('idle')
      },
      () => setGeo('denied'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    )
  }

  function pickDistrict(d: string) {
    const c = DISTRICTS[d]
    // a picked district only moves the point if the farmer hasn't shared a location
    set(c && !draft.located ? { district: d, lat: c.lat, lon: c.lon } : { district: d })
  }

  const districts = Object.keys(DISTRICTS)
  if (draft.district && !districts.includes(draft.district)) districts.unshift(draft.district)

  return (
    <>
      <button
        type="button"
        onClick={locate}
        disabled={geo === 'locating'}
        className={`mt-7 flex min-h-[64px] w-full items-center gap-3 rounded-[24px] px-5 text-left text-[18px] font-semibold transition ${
          draft.located ? 'bg-grow-l text-grow-d' : 'bg-ink text-white active:brightness-125'
        }`}
      >
        {geo === 'locating' ? <span className="h-5 w-5 flex-none animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name={draft.located ? 'check' : 'pin'} />}
        <span className="flex-1">{geo === 'locating' ? t('locating') : draft.located ? t('locationOk') : t('useLocation')}</span>
      </button>
      <p className="mt-2 px-1 text-[14px] leading-snug text-faint" aria-live="polite">
        {geo === 'denied' ? <span className="font-medium text-warn-d">{t('locationDenied')}</span> : t('locationPrivate')}
      </p>

      <SoilFound draft={draft} />

      <Label htmlFor="ob-village">{t('village')}</Label>
      <input id="ob-village" className={FIELD} value={draft.village} onChange={(e) => set({ village: e.target.value })} placeholder={t('villagePlaceholder')} autoComplete="address-level3" />

      <Label htmlFor="ob-district">{t('district')}</Label>
      <div className="relative">
        <select id="ob-district" className={`${FIELD} appearance-none pr-12`} value={draft.district} onChange={(e) => pickDistrict(e.target.value)}>
          {districts.map((d) => (
            <option key={d} value={d}>
              {districtLabel(d, lang)}
            </option>
          ))}
        </select>
        <Icon name="chevron" className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 rotate-90 text-faint" />
      </div>
    </>
  )
}

const QUICK_ACRES = [1, 2, 5, 10]

function LandStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useTranslation('onboarding')
  const { t: tc } = useTranslation('common')
  const [text, setText] = useState(String(value))

  const commit = (n: number) => {
    const v = Math.max(0, Math.min(1000, round2(n)))
    setText(String(v))
    onChange(v)
  }

  return (
    <>
      <div className="mt-7 flex items-center gap-3 rounded-[28px] bg-card p-2.5">
        <button
          type="button"
          aria-label={t('less')}
          disabled={value <= 0.5}
          onClick={() => commit(value - 0.5)}
          className="h-14 w-14 flex-none rounded-[22px] bg-chip text-[30px] font-semibold text-ink active:brightness-95 disabled:text-hint"
        >
          −
        </button>
        <label className="flex flex-1 flex-col items-center">
          <input
            inputMode="decimal"
            aria-label={t('land')}
            className="num w-full bg-transparent text-center text-[40px] font-semibold leading-none text-ink outline-none"
            value={text}
            onChange={(e) => {
              const raw = e.target.value.replace(',', '.').replace(/[^\d.]/g, '')
              setText(raw)
              const n = parseFloat(raw)
              onChange(Number.isFinite(n) ? Math.min(1000, round2(n)) : 0)
            }}
            onBlur={() => commit(value)}
          />
          <span className="mt-1 text-[15px] text-faint">{tc('units.acres')}</span>
        </label>
        <button
          type="button"
          aria-label={t('more')}
          onClick={() => commit(value + 0.5)}
          className="h-14 w-14 flex-none rounded-[22px] bg-chip text-[30px] font-semibold text-ink active:brightness-95"
        >
          +
        </button>
      </div>
      <p className="mt-2 text-center text-[14px] text-faint" aria-live="polite">
        {value > 0 ? t('guntha', { g: Math.round(value * 40) }) : t('landNeeded')}
      </p>

      <div className="mt-6 px-1 text-[15px] font-semibold text-ink-2">{t('quick')}</div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {QUICK_ACRES.map((n) => {
          const on = value === n
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              onClick={() => commit(n)}
              className={`h-14 rounded-[20px] text-[19px] font-semibold transition ${on ? 'bg-grow text-white' : 'bg-card text-ink active:bg-chip'}`}
            >
              <span className="num">{n}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
