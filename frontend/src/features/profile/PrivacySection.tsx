import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FarmerProfile } from '@/lib/api/types'
import { fmtDate, useLang } from '@/i18n'
import { downloadProfile } from './profileData'
import { PIcon, Row, RowGroup, type PIconName } from './parts'

function Fact({ icon, children, never }: { icon: PIconName; children: string; never?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 py-1.5 text-[14.5px] leading-snug text-ink-2">
      <span className={`mt-px flex h-7 w-7 flex-none items-center justify-center rounded-full ${never ? 'bg-danger-l text-danger' : 'bg-grow-l text-grow-d'}`}>
        <PIcon name={icon} size={15} />
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  )
}

/** What Arth keeps and never keeps, then the two data rights: take a copy, or erase it all. */
export function PrivacySection({ f, onDelete }: { f: FarmerProfile; onDelete: () => void }) {
  const { t } = useTranslation('profile')
  const { lang } = useLang()
  const [saved, setSaved] = useState(false)
  const long = { day: 'numeric', month: 'long', year: 'numeric' } as const

  return (
    <div className="space-y-3">
      <div className="rounded-[26px] bg-card px-4 py-4">
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <div>
            <div className="mb-1 text-[12.5px] font-semibold uppercase tracking-[1.3px] text-grow">{t('privacyS.keeps')}</div>
            <ul>
              <Fact icon="profile">{t('privacyS.keep1')}</Fact>
              <Fact icon="clock">{t('privacyS.keep2')}</Fact>
            </ul>
          </div>
          <div>
            <div className="mb-1 text-[12.5px] font-semibold uppercase tracking-[1.3px] text-danger">{t('privacyS.never')}</div>
            <ul>
              <Fact icon="camera" never>
                {t('privacyS.never1')}
              </Fact>
              <Fact icon="mic" never>
                {t('privacyS.never2')}
              </Fact>
              <Fact icon="eyeOff" never>
                {t('privacyS.never3')}
              </Fact>
            </ul>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2.5 rounded-[18px] bg-chip px-3.5 py-3 text-[13.5px] leading-snug text-ink-2">
          <PIcon name="shield" size={18} className="mt-px text-grow" />
          {t('privacyS.gemma')}
        </div>
        {f.consentAt || f.updatedAt ? (
          <div className="mt-3 space-y-0.5 px-1 text-[12.5px] text-faint">
            {f.consentAt ? <div>{t('privacyS.consent', { date: fmtDate(f.consentAt, lang, long) })}</div> : null}
            {f.updatedAt ? <div>{t('privacyS.updated', { date: fmtDate(f.updatedAt, lang, long) })}</div> : null}
          </div>
        ) : null}
      </div>

      <RowGroup>
        <Row
          icon="download"
          tint="grow"
          label={t('privacyS.download')}
          sub={saved ? t('privacyS.downloaded') : t('privacyS.downloadSub')}
          chevron={false}
          value={saved ? <PIcon name="check" size={18} className="text-grow" /> : undefined}
          onClick={() => {
            downloadProfile(f)
            setSaved(true)
          }}
        />
        <Row icon="trash" tint="danger" tone="danger" label={t('deleteData')} sub={t('privacyS.deleteSub')} onClick={onDelete} />
      </RowGroup>
    </div>
  )
}
