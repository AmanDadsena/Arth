import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '@/components/ui'
import { round2 } from '@/lib/api/queries'
import { LANGS, useLang } from '@/i18n'
import {
  CROPS,
  DISTRICTS,
  EXPERIENCE,
  FARMING,
  GOALS,
  LIVESTOCK,
  OWNERSHIP,
  SELLS,
  SOILS,
  TANKS,
  WATER,
  experienceBucket,
  nearestDistrict,
  toggle,
  type Draft,
  type QuestionDef,
} from './model'
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
  const head = <QuestionHead emoji={q.emoji} title={t(`q.${q.id}.title`)} why={t(`q.${q.id}.why`)} eyebrow={q.id === 'lang' ? t('welcome') : undefined} />

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
              <OptionTile key={c.value} emoji={c.emoji} label={tc(`crops.${c.value}`)} on={draft.crops.includes(c.value)} onClick={() => set({ crops: toggle(draft.crops, c.value) })} />
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

    case 'ownership':
      return (
        <>
          {head}
          <Group label={t(`q.${q.id}.title`)}>
            {OWNERSHIP.map((o) => (
              <OptionRow key={o.value} emoji={o.emoji} label={t(`ownership.${o.value}`)} hint={t(`ownershipHint.${o.value}`)} on={draft.landOwnership === o.value} onClick={() => pick({ landOwnership: o.value })} />
            ))}
          </Group>
        </>
      )

    case 'soil':
      return (
        <>
          {head}
          <Group label={t(`q.${q.id}.title`)}>
            {SOILS.map((s) => (
              <OptionRow key={s.value} swatch={s.swatch} label={tc(`soil.${s.value}`)} hint={t(`soilHint.${s.value}`)} on={draft.soilType === s.value} onClick={() => pick({ soilType: s.value })} />
            ))}
          </Group>
          <SkipNote>{t('soilSkip')}</SkipNote>
        </>
      )

    case 'water':
      return (
        <>
          {head}
          <Group label={t(`q.${q.id}.title`)}>
            {WATER.map((w) => (
              <OptionRow key={w.value} emoji={w.emoji} label={tc(`irrigation.${w.value}`)} hint={t(`waterHint.${w.value}`)} on={draft.irrigation === w.value} onClick={() => pick({ irrigation: w.value })} />
            ))}
          </Group>
        </>
      )

    case 'tank':
      return (
        <>
          {head}
          <div role="radiogroup" aria-label={t(`q.${q.id}.title`)} className="mt-7 grid grid-cols-3 gap-2.5">
            {TANKS.map((n) => {
              const on = draft.tankSizeLitres === n
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pick({ tankSizeLitres: n })}
                  className={`flex min-h-[84px] flex-col items-center justify-center rounded-[24px] transition motion-safe:active:scale-[.97] ${
                    on ? 'bg-grow-l text-grow-d ring-2 ring-inset ring-grow' : 'bg-card text-ink active:bg-chip'
                  }`}
                >
                  <span className="num text-[28px] font-semibold leading-none">{n}</span>
                  <span className="mt-1 text-[14px] text-muted">{tc('units.litres')}</span>
                </button>
              )
            })}
          </div>
          <SkipNote>{t('tankHint')}</SkipNote>
        </>
      )

    case 'experience': {
      const cur = experienceBucket(draft.experienceYears)?.id
      return (
        <>
          {head}
          <Group label={t(`q.${q.id}.title`)}>
            {EXPERIENCE.map((b) => (
              <OptionRow key={b.id} emoji={b.emoji} label={t(`experience.${b.id}`)} on={cur === b.id} onClick={() => pick({ experienceYears: b.years })} />
            ))}
          </Group>
        </>
      )
    }

    case 'farmingType':
      return (
        <>
          {head}
          <Group label={t(`q.${q.id}.title`)}>
            {FARMING.map((f) => (
              <OptionRow key={f.value} emoji={f.emoji} label={t(`farming.${f.value}`)} hint={t(`farmingHint.${f.value}`)} on={draft.farmingType === f.value} onClick={() => pick({ farmingType: f.value })} />
            ))}
          </Group>
        </>
      )

    case 'goals':
      return (
        <>
          {head}
          <MultiHint />
          <div role="group" aria-label={t(`q.${q.id}.title`)} className="mt-3 grid grid-cols-2 gap-2.5">
            {GOALS.map((g) => (
              <OptionTile key={g.value} emoji={g.emoji} label={t(`goals.${g.value}`)} on={draft.goals.includes(g.value)} onClick={() => set({ goals: toggle(draft.goals, g.value) })} />
            ))}
          </div>
        </>
      )

    case 'sellsAt':
      return (
        <>
          {head}
          <MultiHint />
          <Group label={t(`q.${q.id}.title`)} multi>
            {SELLS.map((s) => (
              <OptionRow key={s.value} multi emoji={s.emoji} label={t(`sells.${s.value}`)} on={draft.sellsAt.includes(s.value)} onClick={() => set({ sellsAt: toggle(draft.sellsAt, s.value) })} />
            ))}
          </Group>
        </>
      )

    case 'livestock':
      return (
        <>
          {head}
          <MultiHint />
          <Group label={t(`q.${q.id}.title`)} multi>
            {LIVESTOCK.map((a) => (
              <OptionRow
                key={a.value}
                multi
                emoji={a.emoji}
                label={t(`livestock.${a.value}`)}
                on={draft.livestock.includes(a.value)}
                onClick={() => set({ livestock: toggle(draft.livestock, a.value, ['none']) })}
              />
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

function SkipNote({ children }: { children: ReactNode }) {
  return <p className="mt-3 px-1 text-[14px] leading-snug text-faint">{children}</p>
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

function WhereFields({ draft, set }: { draft: Draft; set: (patch: Partial<Draft>) => void }) {
  const { t } = useTranslation('onboarding')
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
    set(c && !draft.located ? { district: d, lat: c[0], lon: c[1] } : { district: d })
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

      <Label htmlFor="ob-village">{t('village')}</Label>
      <input id="ob-village" className={FIELD} value={draft.village} onChange={(e) => set({ village: e.target.value })} placeholder={t('villagePlaceholder')} autoComplete="address-level3" />

      <Label htmlFor="ob-district">{t('district')}</Label>
      <div className="relative">
        <select id="ob-district" className={`${FIELD} appearance-none pr-12`} value={draft.district} onChange={(e) => pickDistrict(e.target.value)}>
          {districts.map((d) => (
            <option key={d} value={d}>
              {t(`districts.${d}`, { defaultValue: d })}
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
