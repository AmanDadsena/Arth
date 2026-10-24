import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ConfirmDialog, EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { isNotFound, useFarmer } from '@/lib/api/queries'
import { useAuth } from '@/features/auth/useAuth'
import { completeness, useOnline, type BasicField } from './profileData'
import { PIcon, Section } from './parts'
import { ProfileHero } from './ProfileHero'
import { FarmSection } from './FarmSection'
import { BasicsSheet } from './BasicsSheet'
import { QuickActions } from './QuickActions'
import { SettingsSection } from './SettingsSection'
import { HelpSection } from './HelpSection'
import { PrivacySection } from './PrivacySection'
import { AboutSection } from './AboutSection'

/**
 * Profile is where a farmer comes to find things: their farm at a glance,
 * the tools not on the bottom bar, language and alerts, help, and full control
 * of their data. Grouped under plain headings with a jump rail on top.
 */

const SECTIONS = ['farm', 'settings', 'help', 'privacy', 'about'] as const

function jump(id: string) {
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(`p-${id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

function StatusChip({ demo }: { demo: boolean }) {
  const { t } = useTranslation('profile')
  const online = useOnline()
  const label = !online ? t('status.offline') : demo ? t('status.demo') : t('status.online')
  return (
    <span
      role="status"
      title={label}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${
        online ? 'bg-grow-l text-grow-d' : 'bg-warn-l text-warn-d'
      }`}
    >
      <PIcon name={online ? 'wifi' : 'wifiOff'} size={14} />
      <span className="truncate">{online ? t('status.online') : t('status.offline')}</span>
    </span>
  )
}

function ProfileSkeleton() {
  const { t } = useTranslation('common')
  return (
    <div role="status" aria-label={t('loading')} className="space-y-3">
      <Skeleton className="h-9 w-1/2" rounded="rounded-xl" />
      <Skeleton className="h-[250px] w-full" rounded="rounded-[30px]" />
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11 w-20" rounded="rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-24 w-full" rounded="rounded-[24px]" />
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" rounded="rounded-[24px]" />
        ))}
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation('common')
  const nav = useNavigate()
  const { status, email, signOut, deleteAccount } = useAuth()
  const farmer = useFarmer()
  const [queue, setQueue] = useState<BasicField[] | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteFailed, setDeleteFailed] = useState(false)
  const demo = status === 'demo'
  const editCore = () => nav('/onboarding?edit=1')

  if (farmer.isPending) return <ProfileSkeleton />
  if (farmer.isError && !farmer.data) {
    if (isNotFound(farmer.error)) {
      return (
        <EmptyState
          icon="sprout"
          title={t('error.noProfile')}
          body={t('error.noProfileBody')}
          action={
            <Button icon="edit" onClick={() => nav('/onboarding')}>
              {t('error.setup')}
            </Button>
          }
        />
      )
    }
    return <ErrorState error={farmer.error} onRetry={() => void farmer.refetch()} />
  }
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
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="display text-[30px] leading-tight text-ink">{t('title')}</div>
          <p className="text-[14px] leading-snug text-muted">{t('sub')}</p>
        </div>
        <StatusChip demo={demo} />
      </header>

      <ProfileHero
        f={f}
        demo={demo}
        email={email}
        onFinishCore={editCore}
        onFinish={() => {
          const { missing } = completeness(f)
          if (missing.length) setQueue(missing)
        }}
      />

      {/* jump rail: every section one tap away */}
      <nav aria-label={t('rail.label')} className="sticky top-0 z-10 -mx-4 mt-3 bg-screen/90 px-4 py-2 backdrop-blur-md">
        <div className="sc flex gap-2 overflow-x-auto">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => jump(s)}
              className="min-h-11 flex-none rounded-2xl bg-card px-4 text-[15px] font-semibold text-ink-2 active:bg-chip"
            >
              {t(`rail.${s}`)}
            </button>
          ))}
        </div>
      </nav>

      <Section id="p-farm" title={t('farm')} hint={t('farmSub')}>
        <FarmSection f={f} onEditCore={editCore} onEditBasic={(k) => setQueue([k])} />
        <Button variant="secondary" size="md" icon="edit" className="mt-3" onClick={editCore}>
          {t('editProfile')}
        </Button>
      </Section>

      <Section id="p-quick" title={t('quick.title')}>
        <QuickActions f={f} />
      </Section>

      <Section id="p-settings" title={t('prefs.title')}>
        <SettingsSection f={f} />
      </Section>

      <Section id="p-help" title={t('help.title')}>
        <HelpSection />
      </Section>

      <Section id="p-privacy" title={t('privacyS.title')} hint={t('privacyS.hint')}>
        <PrivacySection f={f} onDelete={() => setConfirm(true)} />
      </Section>

      <Section id="p-about" title={t('aboutS.title')}>
        <AboutSection />
      </Section>

      <div className="mt-6">
        <Button variant="secondary" icon="logout" onClick={() => void signOut()}>
          {demo ? t('exitDemo', { defaultValue: tc('exitDemo') }) : t('signOut')}
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
