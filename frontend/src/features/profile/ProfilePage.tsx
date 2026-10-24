import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, ConfirmDialog, EyebrowLabel, Icon, LanguageSwitcher, SkeletonScreen, type IconName } from '@/components/ui'
import { toInput, useFarmer, useSaveFarmer } from '@/lib/api/queries'
import { useAuth } from '@/features/auth/useAuth'

function Fact({ icon, label, value }: { icon: IconName; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-chip text-ink-2">
        <Icon name={icon} size={19} />
      </span>
      <div className="min-w-0 flex-1 text-[14px] text-faint">{label}</div>
      <div className="text-right text-[16px] font-semibold text-ink">{value}</div>
    </div>
  )
}

export default function ProfilePage() {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation('common')
  const { t: to } = useTranslation('onboarding')
  const nav = useNavigate()
  const { status, email, signOut, deleteAccount } = useAuth()
  const farmer = useFarmer()
  const save = useSaveFarmer()
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteFailed, setDeleteFailed] = useState(false)

  if (!farmer.data) return <SkeletonScreen cards={2} />
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
      <div className="flex items-center gap-4 pt-1">
        <div className="display flex h-16 w-16 flex-none items-center justify-center rounded-[26px] bg-grow text-[30px] text-white">{f.name.trim().charAt(0) || '?'}</div>
        <div className="min-w-0">
          <h1 className="display truncate text-[30px] leading-tight text-ink">{f.name}</h1>
          <div className="mt-0.5 flex items-center gap-1.5 text-[15px] text-muted">
            <Icon name="pin" size={15} />
            {f.village}, {f.district}
          </div>
          <div className="mt-0.5 text-[13px] text-faint">{status === 'demo' ? t('demoUser') : email ? t('signedInAs', { email }) : null}</div>
        </div>
      </div>

      <Card className="mt-6 px-5 py-3">
        <EyebrowLabel>{t('farm')}</EyebrowLabel>
        <div className="mt-1 divide-y divide-hair">
          <Fact icon="sprout" label={to('crops')} value={f.crops.map((c) => tc(`crops.${c}`)).join(', ')} />
          <Fact icon="mandi" label={to('land')} value={<><span className="num">{f.landAcres}</span> {tc('units.acres')}</>} />
          <Fact icon="globe" label={to('soil')} value={tc(`soil.${f.soilType}`)} />
          <Fact icon="drop" label={to('irrigation')} value={tc(`irrigation.${f.irrigation}`)} />
          <Fact icon="label" label={to('tank')} value={<><span className="num">{f.tankSizeLitres}</span> {tc('units.litres')}</>} />
        </div>
        <Button variant="secondary" size="md" icon="edit" className="mb-1 mt-2 bg-chip" onClick={() => nav('/onboarding?edit=1')}>
          {t('editProfile')}
        </Button>
      </Card>

      <Card className="mt-3 px-5 py-4">
        <EyebrowLabel>{t('language')}</EyebrowLabel>
        <LanguageSwitcher
          className="mt-3 flex-wrap"
          onPick={(lang) => lang !== f.lang && save.mutate({ ...toInput(f), lang })}
        />
        {save.isSuccess ? <div className="mt-2 text-[13px] font-semibold text-grow">{t('saved')}</div> : null}
      </Card>

      <div className="mt-6 space-y-2.5">
        <Button variant="secondary" icon="logout" onClick={() => void signOut()}>
          {t('signOut')}
        </Button>
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="flex h-[58px] w-full items-center justify-center gap-2.5 rounded-[30px] border-2 border-danger/30 text-[17px] font-semibold text-danger active:bg-danger-l"
        >
          <Icon name="trash" />
          {t('deleteData')}
        </button>
      </div>

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
