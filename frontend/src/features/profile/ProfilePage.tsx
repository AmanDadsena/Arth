import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { isNotFound, useFarmer } from '@/lib/api/queries'
import { useAuth } from '@/features/auth/useAuth'
import { useOnline } from './profileData'
import { PIcon, Row, RowGroup, Section } from './parts'
import { ProfileHero } from './ProfileHero'
import { FarmSection } from './FarmSection'
import { SoilCard } from './SoilCard'
import { QuickActions } from './QuickActions'

/**
 * Profile keeps to what a farmer opens it for: who they are, their farm, what
 * their district's soil tests say, and the tools not on the bottom bar.
 * Everything else (language, alerts, tank, help, privacy, about) is one tap
 * away in Settings, so this screen stays short.
 */

function StatusChip() {
  const { t } = useTranslation('profile')
  const online = useOnline()
  const label = online ? t('status.online') : t('status.offline')
  return (
    <span
      role="status"
      title={label}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${
        online ? 'bg-grow-l text-grow-d' : 'bg-warn-l text-warn-d'
      }`}
    >
      <PIcon name={online ? 'wifi' : 'wifiOff'} size={14} />
      <span className="truncate">{label}</span>
    </span>
  )
}

function ProfileSkeleton() {
  const { t } = useTranslation('common')
  return (
    <div role="status" aria-label={t('loading')} className="space-y-3">
      <Skeleton className="h-9 w-1/2" rounded="rounded-xl" />
      <Skeleton className="h-[150px] w-full" rounded="rounded-[30px]" />
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
  const nav = useNavigate()
  const { email } = useAuth()
  const farmer = useFarmer()
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

  return (
    <>
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="display text-[30px] leading-tight text-ink">{t('title')}</div>
        <StatusChip />
      </header>

      <ProfileHero f={f} email={email} />

      <Section id="p-farm" title={t('farm')} hint={t('farmSub')}>
        <FarmSection f={f} onEditCore={editCore} onEditSoil={() => nav('/settings#farm')} />
      </Section>

      <Section id="p-soil" title={t('soil.heading')}>
        <SoilCard />
      </Section>

      <Section id="p-quick" title={t('quick.title')}>
        <QuickActions f={f} />
      </Section>

      <div className="mt-8">
        <RowGroup>
          <Row icon="settings" tint="neutral" label={t('settings.title')} sub={t('settings.rowSub')} onClick={() => nav('/settings')} />
          <Row icon="phone" tint="grow" label={t('help.kccTitle')} sub={t('help.kccBody')} href="tel:18001801551" chevron={false} />
        </RowGroup>
      </div>
    </>
  )
}
