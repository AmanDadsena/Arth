import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FarmerProfile, SoilType } from '@/lib/api/types'
import { toInput, useSaveFarmer } from '@/lib/api/queries'
import { BottomSheet } from '@/components/ui'
import { PIcon, Row, RowGroup } from './parts'

const TANKS = [10, 12, 15, 16, 20]
const SOILS: { value: SoilType; swatch: string }[] = [
  { value: 'black', swatch: '#2f2a24' },
  { value: 'red', swatch: '#a4462b' },
  { value: 'alluvial', swatch: '#b59a72' },
  { value: 'laterite', swatch: '#8a4426' },
  { value: 'sandy', swatch: '#dcc38e' },
  { value: 'clay', swatch: '#7a6550' },
]

type Sheet = 'tank' | 'soil' | null

/**
 * The farm settings onboarding no longer asks: the sprayer tank (label doses
 * are scaled to it) and, only if the district's soil is wrong for this field,
 * the farmer's own soil type. "Use my district's soil" hands it back to the backend.
 */
export function FarmDetailsSection({ f, sheet, setSheet }: { f: FarmerProfile; sheet: Sheet; setSheet: (s: Sheet) => void }) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation('common')
  const save = useSaveFarmer()
  const [failed, setFailed] = useState(false)
  const auto = f.soilSource !== 'farmer'

  async function put(patch: Partial<FarmerProfile>) {
    setFailed(false)
    try {
      await save.mutateAsync({ ...toInput(f), ...patch })
      setSheet(null)
    } catch {
      setFailed(true)
    }
  }

  const option = (on: boolean) =>
    `flex min-h-[60px] w-full items-center gap-3 rounded-[20px] px-4 text-left text-[17px] font-semibold transition ${
      on ? 'bg-grow-l text-grow-d ring-2 ring-inset ring-grow' : 'bg-card text-ink active:bg-chip'
    }`

  return (
    <>
      <RowGroup>
        <Row icon="label" tint="warn" label={t('tile.tank')} sub={t('details.tankSub')} value={<span className="num">{f.tankSizeLitres} {tc('units.litres')}</span>} onClick={() => setSheet('tank')} />
        <Row
          icon="layers"
          tint="grow"
          label={t('tile.soil')}
          sub={auto ? t('tile.soilAuto', { district: f.district }) : t('tile.soilYours')}
          value={tc(`soil.${f.soilType}`)}
          onClick={() => setSheet('soil')}
        />
      </RowGroup>

      <BottomSheet open={sheet === 'tank'} onClose={() => setSheet(null)} title={t('tile.tank')}>
        <p className="mb-3 text-[14.5px] leading-snug text-muted">{t('details.tankWhy')}</p>
        <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label={t('tile.tank')}>
          {TANKS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={f.tankSizeLitres === n}
              disabled={save.isPending}
              onClick={() => void put({ tankSizeLitres: n })}
              className={`${option(f.tankSizeLitres === n)} flex-col justify-center gap-0`}
            >
              <span className="num text-[26px] leading-none">{n}</span>
              <span className="text-[13px] font-medium text-muted">{tc('units.litres')}</span>
            </button>
          ))}
        </div>
        {failed ? <p className="mt-3 text-center text-[14px] font-semibold text-warn-d">{t('sheet.saveFailed')}</p> : null}
      </BottomSheet>

      <BottomSheet open={sheet === 'soil'} onClose={() => setSheet(null)} title={t('tile.soil')}>
        <p className="mb-3 text-[14.5px] leading-snug text-muted">{t('details.soilWhy')}</p>
        <button type="button" disabled={save.isPending} onClick={() => void put({ soilSource: 'auto' })} className={option(auto)}>
          <PIcon name="pin" size={20} className="text-grow" />
          <span className="flex-1">{t('details.soilAuto', { district: f.district })}</span>
        </button>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={t('tile.soil')}>
          {SOILS.map((s) => {
            const on = !auto && f.soilType === s.value
            return (
              <button key={s.value} type="button" role="radio" aria-checked={on} disabled={save.isPending} onClick={() => void put({ soilType: s.value, soilSource: 'farmer' })} className={option(on)}>
                <span aria-hidden className="h-6 w-6 flex-none rounded-full ring-2 ring-white" style={{ background: s.swatch }} />
                {tc(`soil.${s.value}`)}
              </button>
            )
          })}
        </div>
        {failed ? <p className="mt-3 text-center text-[14px] font-semibold text-warn-d">{t('sheet.saveFailed')}</p> : null}
      </BottomSheet>
    </>
  )
}
