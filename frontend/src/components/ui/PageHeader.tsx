import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconButton } from './Button'

/** Screen title with an optional back button and right-side action. */
export function PageHeader({
  title,
  subtitle,
  back = true,
  backTo,
  right,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: boolean
  backTo?: string
  right?: ReactNode
}) {
  const nav = useNavigate()
  const { t } = useTranslation('common')
  return (
    <header className="flex items-start gap-3 pb-2">
      {back ? (
        <IconButton icon="back" label={t('back')} onClick={() => (backTo ? nav(backTo) : window.history.length > 1 ? nav(-1) : nav('/'))} />
      ) : null}
      <div className="min-w-0 flex-1 pt-0.5">
        <h1 className="display text-[30px] leading-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[15px] text-muted">{subtitle}</p> : null}
      </div>
      {right}
    </header>
  )
}
