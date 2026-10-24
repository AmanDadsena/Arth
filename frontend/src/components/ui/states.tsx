import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/lib/api/client'
import { Button } from './Button'
import { Icon, type IconName } from './Icon'

/** Loading, error, empty and escalate — every screen needs all four. */

export function Skeleton({ className = '', rounded = 'rounded-[22px]' }: { className?: string; rounded?: string }) {
  return <div aria-hidden className={`skeleton ${rounded} ${className}`} />
}

/** A screen-shaped placeholder: a title bar and a few cards. */
export function SkeletonScreen({ cards = 3 }: { cards?: number }) {
  const { t } = useTranslation('common')
  return (
    <div role="status" aria-label={t('loading')} className="space-y-3">
      <Skeleton className="h-9 w-2/3" rounded="rounded-xl" />
      <Skeleton className="h-5 w-1/3" rounded="rounded-lg" />
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  )
}

export function ErrorState({ error, onRetry, title }: { error?: unknown; onRetry?: () => void; title?: ReactNode }) {
  const { t } = useTranslation('common')
  const timeout = error instanceof ApiError && error.code === 'timeout'
  const offline = error instanceof ApiError && error.code === 'network'
  const body = timeout ? t('error.timeout') : offline ? t('error.offline') : t('error.body')
  return (
    <div role="alert" className="rounded-[26px] bg-card px-5 py-6 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warn-l text-warn">
        <Icon name={offline ? 'cloud' : 'alert'} />
      </span>
      <div className="display mt-3 text-[22px] text-ink">{title ?? t('error.title')}</div>
      <p className="mt-1.5 text-[15px] leading-snug text-muted">{body}</p>
      {onRetry ? (
        <Button variant="secondary" size="md" icon="retry" className="mt-4 bg-chip" onClick={onRetry}>
          {t('retry')}
        </Button>
      ) : null}
    </div>
  )
}

export function EmptyState({ icon = 'sprout', title, body, action }: { icon?: IconName; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[26px] bg-card px-5 py-7 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-grow-l text-grow">
        <Icon name={icon} />
      </span>
      <div className="display mt-3 text-[21px] text-ink">{title}</div>
      {body ? <p className="mt-1.5 text-[15px] leading-snug text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export const KCC_NUMBER = '1800-180-1551'
const KCC_TEL = 'tel:18001801551'

/** Kisan Call Centre — shown whenever the app is not sure enough to advise. */
export function EscalateCard({ reason }: { reason?: ReactNode }) {
  const { t } = useTranslation('common')
  return (
    <div className="rounded-[26px] bg-ink px-5 py-5 text-white">
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white/15">
          <Icon name="phone" />
        </span>
        <div>
          <div className="text-[17px] font-semibold">{t('escalate.title')}</div>
          <p className="mt-1 text-[15px] leading-snug text-white/75">{reason ?? t('escalate.body')}</p>
        </div>
      </div>
      <a
        href={KCC_TEL}
        className="mt-4 flex h-14 items-center justify-center gap-2.5 rounded-[28px] bg-card text-[18px] font-semibold text-ink"
      >
        <Icon name="phone" size={20} />
        <span className="num">{KCC_NUMBER}</span>
      </a>
      <div className="mt-2 text-center text-[13px] text-white/60">{t('escalate.free')}</div>
    </div>
  )
}

/** Subtle provenance tag on every AI result. */
export function AiTag({ model = 'Gemma 4' }: { model?: string }) {
  const { t } = useTranslation('common')
  const name = /gemma/i.test(model) ? 'Gemma 4' : model
  return (
    <div className="mt-4 flex items-center justify-center gap-1.5 text-[12px] font-medium text-faint">
      <Icon name="sparkle" size={13} />
      {t('analyzedBy', { model: name })}
    </div>
  )
}
