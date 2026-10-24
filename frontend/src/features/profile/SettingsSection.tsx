import { useTranslation } from 'react-i18next'
import type { FarmerProfile } from '@/lib/api/types'
import { toInput, useSaveFarmer } from '@/lib/api/queries'
import { LanguageSwitcher } from '@/components/ui'
import { setReadAloud, useReadAloudPref } from '@/components/voice'
import { useAlertPrefs } from './profileData'
import { IconBubble, PIcon, RowGroup, ToggleRow } from './parts'

/** Language (saved to the profile) and alert switches (kept on this phone). */
export function SettingsSection({ f }: { f: FarmerProfile }) {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation('common')
  const save = useSaveFarmer()
  const { prefs, toggle } = useAlertPrefs()
  const readAloud = useReadAloudPref()
  const crops = f.crops.map((c) => tc(`crops.${c}`, { defaultValue: c })).join(', ')

  return (
    <div className="space-y-3">
      <div className="rounded-[26px] bg-card px-4 py-4">
        <div className="flex items-center gap-3.5">
          <IconBubble name="globe" tint="grow" />
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold text-ink">{t('language')}</div>
            <div className="text-[13.5px] text-muted">{t('prefs.languageSub')}</div>
          </div>
          {save.isSuccess ? (
            <span role="status" className="flex items-center gap-1 text-[13px] font-semibold text-grow">
              <PIcon name="check" size={15} />
              {t('saved')}
            </span>
          ) : null}
        </div>
        <LanguageSwitcher className="mt-3" onPick={(lang) => lang !== f.lang && save.mutate({ ...toInput(f), lang })} />
      </div>

      <RowGroup>
        <ToggleRow
          icon="speaker"
          tint="grow"
          label={t('prefs.readAloud')}
          sub={t('prefs.readAloudSub')}
          on={readAloud}
          onToggle={() => setReadAloud(!readAloud)}
        />
      </RowGroup>

      <div>
        <div className="mx-1 mb-2 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[1.4px] text-faint">
          <PIcon name="bell" size={15} />
          {t('prefs.alerts')}
        </div>
        <RowGroup>
          <ToggleRow icon="rain" tint="neutral" label={t('prefs.rain')} sub={t('prefs.rainSub')} on={prefs.rain} onToggle={() => toggle('rain')} />
          <ToggleRow
            icon="mandi"
            tint="grow"
            label={t('prefs.price')}
            sub={crops ? t('prefs.priceSub', { crops }) : t('prefs.priceSubNone')}
            on={prefs.price}
            onToggle={() => toggle('price')}
          />
          <ToggleRow icon="schemes" tint="amber" label={t('prefs.schemes')} sub={t('prefs.schemesSub')} on={prefs.schemes} onToggle={() => toggle('schemes')} />
        </RowGroup>
        <p className="mx-2 mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug text-faint">
          <PIcon name="info" size={14} className="mt-px" />
          {t('prefs.alertsHint')}
        </p>
      </div>
    </div>
  )
}
