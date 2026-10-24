import { useTranslation } from 'react-i18next'
import type { FarmerProfile } from '@/lib/api/types'
import { BASIC_FIELDS, MULTI, hasBasic, type BasicField } from './profileData'
import { Big, Chips, Tile, Word } from './FarmSection'
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

/** The optional questions (kept out of onboarding): answered ones as tiles, the rest one tap away. */
export function AboutYouSection({ f, onEdit }: { f: FarmerProfile; onEdit: (k: BasicField) => void }) {
  const { t } = useTranslation('profile')
  const multi = (k: 'goals' | 'sellsAt' | 'livestock') => (f[k] ?? []).map((v) => t(`${k}.${v}`))
  const answered = BASIC_FIELDS.filter((k) => hasBasic(f, k))
  const missing = BASIC_FIELDS.filter((k) => !hasBasic(f, k))

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {answered.map((k) => (
        <Tile key={k} icon={BASIC_ICON[k]} label={t(BASIC_LABEL[k])} onClick={() => onEdit(k)} wide={MULTI[k] || k === 'farmingType'}>
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
          <div className="text-[15px] font-semibold leading-snug text-ink">{t('tile.moreTitle')}</div>
          <div className="mt-0.5 text-[13.5px] leading-snug text-muted">{t('tile.moreSub')}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {missing.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onEdit(k)}
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
    </div>
  )
}
