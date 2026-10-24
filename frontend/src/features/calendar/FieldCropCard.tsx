import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '@/components/ui'
import type { FieldCrop } from '@/lib/api/types'
import { fmtDate, useLang } from '@/i18n'

/**
 * One of the farmer's own crops and where it usually stands on today's date:
 * stage, the job that stage asks for, and how far through it we are. Worked
 * out from the date alone, so the card says "usually".
 */

export const PHASE: Record<FieldCrop['phase'], { icon: IconName; chip: string; bar: string }> = {
  sow: { icon: 'sprout', chip: 'bg-grow text-white', bar: 'bg-grow' },
  grow: { icon: 'sprout', chip: 'bg-grow-l text-grow-d', bar: 'bg-grow' },
  protect: { icon: 'shield', chip: 'bg-amber-l text-amber', bar: 'bg-amber' },
  harvest: { icon: 'mandi', chip: 'bg-warn-l text-warn-d', bar: 'bg-warn' },
  rest: { icon: 'calendar', chip: 'bg-chip text-muted', bar: 'bg-faint' },
}

export function FieldCropCard({ f, wide = false, onOpen }: { f: FieldCrop; wide?: boolean; onOpen?: () => void }) {
  const { t } = useTranslation('calendar')
  const { lang } = useLang()
  const p = PHASE[f.phase]
  const pct = Math.min(100, Math.max(4, Math.round(f.progress * 100)))
  const Tag = onOpen ? 'button' : 'div'
  return (
    <Tag
      {...(onOpen ? { type: 'button' as const, onClick: onOpen } : {})}
      className={`flex flex-col rounded-[26px] bg-card px-4 py-4 text-left ${wide ? 'w-full' : 'w-[248px] flex-none'} ${onOpen ? 'active:bg-chip' : ''}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="display truncate text-[22px] leading-tight text-ink">{f.name}</span>
        <span className={`inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${p.chip}`}>
          <Icon name={p.icon} size={13} />
          {t(`phase.${f.phase}`)}
        </span>
      </span>
      <span className="mt-1 block text-[13px] font-semibold uppercase tracking-[1.2px] text-faint">{t('field.usually')}</span>
      <span className="mt-0.5 block text-[17px] font-semibold leading-snug text-ink">{f.stage}</span>
      <span className="mt-1 block text-[14.5px] leading-snug text-ink-2">{f.task}</span>
      <span className="mt-auto block pt-3">
        <span className="block h-1.5 overflow-hidden rounded-full bg-chip">
          <span className={`block h-full rounded-full ${p.bar}`} style={{ width: `${pct}%` }} />
        </span>
        <span className="num mt-1.5 flex justify-between text-[12px] text-faint">
          <span>{fmtDate(f.stageFrom, lang)}</span>
          <span>{fmtDate(f.stageTo, lang)}</span>
        </span>
      </span>
    </Tag>
  )
}
