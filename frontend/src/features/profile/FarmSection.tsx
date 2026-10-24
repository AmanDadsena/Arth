import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { FarmerProfile } from '@/lib/api/types'
import { Chip } from '@/components/ui'
import { PIcon, type PIconName } from './parts'

/** One tappable fact about the farm. */
export function Tile({ icon, label, children, empty, onClick, wide, note }: { icon: PIconName; label: string; children?: ReactNode; empty?: boolean; onClick: () => void; wide?: boolean; note?: ReactNode }) {
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
      {note ? <span className="mt-1.5 text-[12px] font-semibold text-grow">{note}</span> : null}
    </button>
  )
}

export function Big({ value, unit }: { value: ReactNode; unit?: ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="display text-[28px] leading-none text-ink">{value}</span>
      {unit ? <span className="text-[14px] font-medium text-faint">{unit}</span> : null}
    </span>
  )
}

export function Word({ children }: { children: ReactNode }) {
  return <span className="block text-[18px] font-semibold leading-snug text-ink">{children}</span>
}

export function Chips({ items }: { items: string[] }) {
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

/** "My farm" at a glance: the four facts the advice runs on. Soil is read from the district, and says so. */
export function FarmSection({ f, onEditCore, onEditSoil }: { f: FarmerProfile; onEditCore: () => void; onEditSoil: () => void }) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation('common')
  const auto = f.soilSource !== 'farmer'

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Tile icon="sprout" label={t('tile.crops')} onClick={onEditCore} wide empty={f.crops.length === 0}>
        <Chips items={f.crops.map((c) => tc(`crops.${c}`, { defaultValue: c }))} />
      </Tile>
      <Tile icon="ruler" label={t('tile.land')} onClick={onEditCore}>
        <Big value={<span className="num">{f.landAcres}</span>} unit={tc('units.acres')} />
      </Tile>
      <Tile icon="drop" label={t('tile.water')} onClick={onEditCore}>
        <Word>{(f.waterSources ?? [f.irrigation]).map((w) => tc(`irrigation.${w}`)).join(', ')}</Word>
      </Tile>
      <Tile icon="layers" label={t('tile.soil')} onClick={onEditSoil} wide note={auto ? t('tile.soilAuto', { district: f.district }) : t('tile.soilYours')}>
        <Word>{tc(`soil.${f.soilType}`)}</Word>
      </Tile>
    </div>
  )
}
