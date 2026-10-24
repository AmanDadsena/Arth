import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActionItem, Priority } from '@/lib/api/types'
import { Icon, type IconName } from './Icon'

/**
 * One thing to do today. Colour follows priority (Rutu keeps orange for risk,
 * green for go); the icon follows the action type; the source tag says where
 * the advice came from so the farmer can judge it.
 */

const TONE: Record<Priority, { wrap: string; dot: string; title: string; body: string }> = {
  high: { wrap: 'bg-warn-l', dot: 'bg-warn text-white', title: 'text-warn-d', body: 'text-warn-m' },
  medium: { wrap: 'bg-amber-l', dot: 'bg-amber text-white', title: 'text-ink', body: 'text-ink-2' },
  low: { wrap: 'bg-grow-l', dot: 'bg-grow text-white', title: 'text-grow-d', body: 'text-grow' },
}

const TYPE_ICON: Record<ActionItem['type'], IconName> = {
  spray: 'drop',
  irrigate: 'drop',
  harvest: 'sprout',
  sell: 'mandi',
  sow: 'sprout',
  protect: 'shield',
  scheme: 'schemes',
}

const SOURCE_ICON: Record<ActionItem['source'], IconName> = { weather: 'weather', mandi: 'mandi', calendar: 'calendar' }

interface ActionCardProps {
  title: ReactNode
  detail?: ReactNode
  priority?: Priority
  icon?: IconName
  source?: ActionItem['source']
  onClick?: () => void
  className?: string
}

export function ActionCard({ title, detail, priority = 'medium', icon = 'info', source, onClick, className = '' }: ActionCardProps) {
  const { t } = useTranslation('common')
  const tone = TONE[priority]
  const Body = (
    <>
      <span className={`flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full ${tone.dot}`}>
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[17px] font-semibold leading-snug ${tone.title}`}>{title}</span>
        {detail ? <span className={`mt-1 block text-[15px] leading-snug ${tone.body}`}>{detail}</span> : null}
        {source ? (
          <span className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white/70 px-2 py-0.5 text-[12px] font-semibold text-muted">
            <Icon name={SOURCE_ICON[source]} size={13} />
            {t(`source.${source}`)}
          </span>
        ) : null}
      </span>
      {onClick ? <Icon name="chevron" size={18} className="mt-2.5 text-faint" /> : null}
    </>
  )
  const cls = `flex w-full items-start gap-3.5 rounded-[26px] px-5 py-4 text-left ${tone.wrap} ${className}`
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {Body}
    </button>
  ) : (
    <div className={cls}>{Body}</div>
  )
}

/** Convenience: render an ActionItem from the API directly. */
export function ActionItemCard({ item, onOpen }: { item: ActionItem; onOpen?: (route: string) => void }) {
  return (
    <ActionCard
      title={item.title}
      detail={item.detail}
      priority={item.priority}
      icon={TYPE_ICON[item.type]}
      source={item.source}
      onClick={item.route && onOpen ? () => onOpen(item.route!) : undefined}
    />
  )
}
