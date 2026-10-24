import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Icon, LanguageSwitcher, type IconName } from '@/components/ui'
import { toInput, useFarmer, useSaveFarmer } from '@/lib/api/queries'
import { useAuth } from './useAuth'
import { setLocalConsent } from './AuthProvider'

function Row({ icon, text, tone }: { icon: IconName; text: string; tone: 'grow' | 'warn' }) {
  return (
    <li className="flex items-center gap-3.5 py-2.5">
      <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-full ${tone === 'grow' ? 'bg-grow-l text-grow' : 'bg-warn-l text-warn'}`}>
        <Icon name={icon} size={20} />
      </span>
      <span className="text-[17px] font-medium leading-snug text-ink">{text}</span>
    </li>
  )
}

/** Short, plain-language consent before anything is stored. */
export default function ConsentPage() {
  const { t } = useTranslation('consent')
  const nav = useNavigate()
  const { signOut } = useAuth()
  const farmer = useFarmer()
  const save = useSaveFarmer()
  const [failed, setFailed] = useState(false)

  async function agree() {
    const at = new Date().toISOString()
    setLocalConsent(at)
    // an existing profile without consent (e.g. after a policy change) is updated in place
    if (farmer.data) {
      try {
        await save.mutateAsync({ ...toInput(farmer.data), consentAt: at })
        nav('/', { replace: true })
      } catch {
        setFailed(true)
      }
      return
    }
    nav('/onboarding', { replace: true })
  }

  return (
    <div className="flex min-h-full flex-col px-5 pb-8 pt-[max(24px,env(safe-area-inset-top))]">
      <LanguageSwitcher className="self-end" />
      <h1 className="display mt-8 text-[36px] leading-tight text-ink">{t('title')}</h1>
      <p className="mt-2 text-[17px] text-muted">{t('sub')}</p>

      <div className="mt-6 rounded-[28px] bg-card px-5 py-4">
        <div className="text-[13px] font-semibold uppercase tracking-[1.6px] text-grow">{t('store')}</div>
        <ul className="mt-1">
          <Row icon="profile" tone="grow" text={t('storeProfile')} />
          <Row icon="lock" tone="grow" text={t('storeHistory')} />
        </ul>
      </div>

      <div className="mt-3 rounded-[28px] bg-card px-5 py-4">
        <div className="text-[13px] font-semibold uppercase tracking-[1.6px] text-warn-m">{t('never')}</div>
        <ul className="mt-1">
          <Row icon="camera" tone="warn" text={t('neverPhotos')} />
          <Row icon="mic" tone="warn" text={t('neverVoice')} />
          <Row icon="shield" tone="warn" text={t('neverIds')} />
        </ul>
      </div>

      <div className="mt-3 space-y-2 rounded-[28px] bg-grow-l px-5 py-4 text-[15px] font-medium leading-snug text-grow-d">
        <div className="flex gap-2.5">
          <Icon name="calendar" size={18} className="mt-0.5" />
          {t('autoDelete')}
        </div>
        <div className="flex gap-2.5">
          <Icon name="trash" size={18} className="mt-0.5" />
          {t('deleteAnytime')}
        </div>
      </div>

      <div className="mt-auto space-y-2.5 pt-8">
        {failed ? <p className="text-center text-[14px] font-semibold text-warn-d">{t('onboarding:saveFailed')}</p> : null}
        <Button icon="check" loading={save.isPending} onClick={() => void agree()}>
          {t('agree')}
        </Button>
        <Button variant="ghost" size="md" onClick={() => void signOut()}>
          {t('decline')}
        </Button>
      </div>
    </div>
  )
}
