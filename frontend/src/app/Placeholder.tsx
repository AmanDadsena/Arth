import { useTranslation } from 'react-i18next'
import { EmptyState, PageHeader, type IconName } from '@/components/ui'

/** Stand-in for a feature screen until its agent builds it. */
export function Placeholder({ navKey, icon, back = true }: { navKey: string; icon: IconName; back?: boolean }) {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t(`nav:${navKey}`)} back={back} />
      <div className="mt-4">
        <EmptyState icon={icon} title={t(`nav:${navKey}`)} body={t('comingSoon')} />
      </div>
    </>
  )
}
