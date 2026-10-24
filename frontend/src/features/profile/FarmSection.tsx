import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { FarmerProfile } from '@/lib/api/types'
import { Chip } from '@/components/ui'
import { BASIC_FIELDS, MULTI, hasBasic, type BasicField } from './profileData'
import { PIcon, type PIconName } from './parts'

const BASIC_ICON: Record<BasicField, PIconName> = {
  experienceYears: 'clock',
  landOwnership: 'key',
  farmingType: 'tractor',
  goals: 'target',
  sellsAt: 'shop',
  livestock: 'cow',
}
const BASIC_LABEL: Record<BasicField, string> = {
  experienceYears: 'tile.experience',
  landOwnership: 'tile.ownership',
  farmingType: 'tile.farmingType',
  goals: 'tile.goals',
  sellsAt: 'tile.sellsAt',
  livestock: 'tile.livestock',
}

/** One tappable fact about the farm. Empty optional facts invite an answer instead of showing a dash. */
function Tile({ icon, label, children, empty, onClick, wide }: { icon: PIconName; label: string; children?: ReactNode; empty?: boolean; onClick: () => void; wide?: boolean }) {
  const { t } = useTranslation('profile')
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[96px] flex-col items-start rounded-[24px] p-4 text-left transition active:scale-[.98] ${
        empty ? 'border-2 border-dashed border-track bg-transparent' : 'bg-card'
      } ${wide ? 'col-span-2' : ''}`}
    >
      <span className="flex w-full items-center gap-2 text-[13px] font-semibold uppercase tracking-[1.2px] text-faint">
        <PIcon name={icon} size={16} className={empty ? 'text-ghost' : 'text-grow'} />
        <span className="min-w-0 flex-1 leading-tight">{label}</span>
        <PIcon name={empty ? 'sparkle' : 'edit'} size={14} className="text-hint" />
      </span>
      <span className="mt-2 w-full">
        {empty ? <span className="text-[16px] font-semibold text-grow">+ {t('tile.add')}</span> : children}
      </span>
    </button>
  )
}

function Big({ value, unit }: { value: ReactNode; unit?: ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="display text-[28px] leading-none text-ink">{value}</span>
      {unit ? <span className="text-[14px] font-medium text-faint">{unit}</span> : null}
    </span>
  )
}

function Word({ children }: { children: ReactNode }) {
  return <span className="block text-[18px] font-semibold leading-snug text-ink">{children}</span>
}

function Chips({ items }: { items: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <Chip key={x} tone="grow" className="px-3 py-1 text-[14px]">
          {x}
        </Chip>
      ))}
    </span>
  )
}

/** "My farm" at a glance. Core facts open the farm editor; the optional basics open a one-question sheet. */
export function FarmSection({ f, onEditCore, onEditBasic }: { f: FarmerProfile; onEditCore: () => void; onEditBasic: (k: BasicField) => void }) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation('common')
  const multi = (k: 'goals' | 'sellsAt' | 'livestock') => (f[k] ?? []).map((v) => t(`${k}.${v}`))
  const missing = BASIC_FIELDS.filter((k) => !hasBasic(f, k))

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Tile icon="sprout" label={t('tile.crops')} onClick={onEditCore} wide empty={f.crops.length === 0}>
        <Chips items={f.crops.map((c) => tc(`crops.${c}`, { defaultValue: c }))} />
      </Tile>
      <Tile icon="ruler" label={t('tile.land')} onClick={onEditCore}>
        <Big value={<span className="num">{f.landAcres}</span>} unit={tc('units.acres')} />
      </Tile>
      <Tile icon="layers" label={t('tile.soil')} onClick={onEditCore}>
        <Word>{tc(`soil.${f.soilType}`)}</Word>
      </Tile>
      <Tile icon="drop" label={t('tile.water')} onClick={onEditCore}>
        <Word>{tc(`irrigation.${f.irrigation}`)}</Word>
      </Tile>
      <Tile icon="label" label={t('tile.tank')} onClick={onEditCore}>
        <Big value={<span className="num">{f.tankSizeLitres}</span>} unit={tc('units.litres')} />
      </Tile>

      {BASIC_FIELDS.filter((k) => hasBasic(f, k)).map((k) => (
        <Tile key={k} icon={BASIC_ICON[k]} label={t(BASIC_LABEL[k])} onClick={() => onEditBasic(k)} wide={MULTI[k] || k === 'farmingType'}>
          {k === 'experienceYears' ? (
            <Big value={<span className="num">{f.experienceYears}</span>} unit={t('sheet.years')} />
          ) : k === 'landOwnership' ? (
            <Word>{t(`ownership.${f.landOwnership}`)}</Word>
          ) : k === 'farmingType' ? (
            <Word>{t(`farmingType.${f.farmingType}`)}</Word>
          ) : (
            <Chips items={multi(k as 'goals' | 'sellsAt' | 'livestock')} />
          )}
        </Tile>
      ))}

      {missing.length ? (
        <div className="col-span-2 rounded-[24px] border-2 border-dashed border-track p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-amber-l text-amber">
              <PIcon name="sparkle" size={19} />
            </span>
            <div className="min-w-0">
              <div className="text-[16px] font-semibold leading-snug text-ink">{t('tile.moreTitle')}</div>
              <div className="mt-0.5 text-[13.5px] leading-snug text-muted">{t('tile.moreSub')}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {missing.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onEditBasic(k)}
                className="flex min-h-12 items-center gap-1.5 rounded-2xl bg-card px-3.5 text-[15px] font-semibold text-ink-2 active:bg-chip"
              >
                <PIcon name={BASIC_ICON[k]} size={16} className="text-grow" />
                {t(BASIC_LABEL[k])}
                <span className="text-grow">+</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <button type="button" onClick={onEditCore} className="col-span-2 flex min-h-[64px] items-center gap-3.5 rounded-[24px] bg-card px-4 py-3 text-left active:bg-chip/70">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-grow-l text-grow-d">
          <PIcon name="pin" size={21} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold uppercase tracking-[1.2px] text-faint">{t('tile.location')}</span>
          <span className="block truncate text-[16px] font-semibold text-ink">
            {[f.village, f.district, f.state].filter(Boolean).join(', ')}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted">
            <PIcon name="lock" size={12} />
            {t('tile.locationHint')}
          </span>
        </span>
        <PIcon name="chevron" size={18} className="text-hint" />
      </button>
    </div>
  )
}
