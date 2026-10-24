import { useTranslation } from 'react-i18next'
import { APP_VERSION, REPO_URL } from './profileData'
import { PIcon, Row, RowGroup } from './parts'

/** Version, the model behind the advice, and where the code lives. */
export function AboutSection() {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation('common')
  return (
    <div className="space-y-3">
      <RowGroup>
        <Row icon="sparkle" tint="grow" label={t('aboutS.gemma')} sub={t('aboutS.gemmaSub')} chevron={false} />
        <Row icon="code" tint="neutral" label={t('aboutS.openSource')} sub={t('aboutS.openSourceSub')} href={REPO_URL} external />
      </RowGroup>
      <div className="pt-2 text-center">
        <div className="display text-[22px] leading-none text-ink">
          {tc('brand')} <span className="text-grow">{tc('brandDeva')}</span>
        </div>
        <div className="num mt-1.5 text-[12.5px] text-faint">{t('aboutS.version', { v: APP_VERSION })}</div>
        <div className="mt-1 flex items-center justify-center gap-1 text-[12.5px] text-faint">
          <PIcon name="pin" size={12} />
          {t('aboutS.made')}
        </div>
      </div>
    </div>
  )
}
