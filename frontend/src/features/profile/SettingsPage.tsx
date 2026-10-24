import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ConfirmDialog, ErrorState, PageHeader, SkeletonScreen } from '@/components/ui'
import { useFarmer } from '@/lib/api/queries'
import { useAuth } from '@/features/auth/useAuth'
import type { BasicField } from './profileData'
import { Section } from './parts'
import { SettingsSection } from './SettingsSection'
import { FarmDetailsSection } from './FarmDetailsSection'
import { AboutYouSection } from './AboutYouSection'
import { BasicsSheet } from './BasicsSheet'
import { HelpSection } from './HelpSection'
import { PrivacySection } from './PrivacySection'
import { AboutSection } from './AboutSection'

/**
 * Everything that is not needed every day, off the Profile screen: language
 * and alerts, farm details (tank, soil), the optional "about you" answers,
 * help, privacy and data, and about. A jump rail on top, sign out at the end.
 */

const SECTIONS = ['prefs', 'farm', 'you', 'help', 'privacy', 'about'] as const

function jump(id: string) {
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(`s-${id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

export default function SettingsPage() {
  const { t } = useTranslation('profile')
  const { signOut, deleteAccount } = useAuth()
  const farmer = useFarmer()
  const [queue, setQueue] = useState<BasicField[] | null>(null)
  const [sheet, setSheet] = useState<'tank' | 'soil' | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteFailed, setDeleteFailed] = useState(false)
  const { hash } = useLocation()
  const ready = !!farmer.data

  // /settings#farm (from the soil tile on Profile) lands on that section
  useEffect(() => {
    if (ready && hash) jump(hash.slice(1))
  }, [ready, hash])

  if (farmer.isPending) return <SkeletonScreen cards={5} />
  if (!farmer.data) return <ErrorState error={farmer.error} onRetry={() => void farmer.refetch()} />
  const f = farmer.data

  async function doDelete() {
    setDeleting(true)
    setDeleteFailed(false)
    try {
      await deleteAccount()
    } catch {
      setDeleteFailed(true)
      setDeleting(false)
    }
  }

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.sub')} backTo="/profile" />

      <nav aria-label={t('rail.label')} className="sticky top-0 z-10 -mx-4 mt-2 bg-screen/90 px-4 py-2 backdrop-blur-md">
        <div className="sc flex gap-2 overflow-x-auto">
          {SECTIONS.map((s) => (
            <button key={s} type="button" onClick={() => jump(s)} className="min-h-11 flex-none rounded-2xl bg-card px-4 text-[15px] font-semibold text-ink-2 active:bg-chip">
              {t(`settings.rail.${s}`)}
            </button>
          ))}
        </div>
      </nav>

      <Section id="s-prefs" title={t('prefs.title')}>
        <SettingsSection f={f} />
      </Section>

      <Section id="s-farm" title={t('details.title')} hint={t('details.hint')}>
        <FarmDetailsSection f={f} sheet={sheet} setSheet={setSheet} />
      </Section>

      <Section id="s-you" title={t('you.title')} hint={t('you.hint')}>
        <AboutYouSection f={f} onEdit={(k) => setQueue([k])} />
      </Section>

      <Section id="s-help" title={t('help.title')}>
        <HelpSection />
      </Section>

      <Section id="s-privacy" title={t('privacyS.title')} hint={t('privacyS.hint')}>
        <PrivacySection f={f} onDelete={() => setConfirm(true)} />
      </Section>

      <Section id="s-about" title={t('aboutS.title')}>
        <AboutSection />
      </Section>

      <div className="mt-6">
        <Button variant="secondary" icon="logout" onClick={() => void signOut()}>
          {t('signOut')}
        </Button>
      </div>

      {queue ? <BasicsSheet f={f} queue={queue} onClose={() => setQueue(null)} /> : null}

      <ConfirmDialog
        open={confirm}
        danger
        busy={deleting}
        title={t('deleteTitle')}
        body={
          <>
            <p>{t('deleteBody')}</p>
            {deleteFailed ? <p className="mt-2 font-semibold text-danger">{t('deleteFailed')}</p> : null}
          </>
        }
        confirmLabel={deleting ? t('deleting') : t('deleteConfirm')}
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirm(false)}
      />
    </>
  )
}
