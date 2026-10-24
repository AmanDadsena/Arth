import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { FarmerProfile } from '@/lib/api/types'
import { IconBubble, type PIconName } from './parts'

/** The four tools that are not on the bottom bar, one tap from Profile. */
export function QuickActions({ f }: { f: FarmerProfile }) {
  const { t } = useTranslation('profile')
  const nav = useNavigate()
  const items: { to: string; icon: PIconName; tint: 'grow' | 'amber' | 'warn' | 'neutral'; title: string; sub: string }[] = [
    { to: '/schemes', icon: 'schemes', tint: 'grow', title: t('quick.schemes'), sub: t('quick.schemesSub') },
    { to: '/weather', icon: 'rain', tint: 'neutral', title: t('quick.weather'), sub: t('quick.weatherSub') },
    { to: '/label', icon: 'label', tint: 'warn', title: t('quick.label'), sub: t('quick.labelSub', { tank: f.tankSizeLitres }) },
    { to: '/kagaz', icon: 'kagaz', tint: 'amber', title: t('quick.kagaz'), sub: t('quick.kagazSub') },
  ]
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((it) => (
        <button
          key={it.to}
          type="button"
          onClick={() => nav(it.to)}
          className="flex min-h-[118px] flex-col items-start justify-between rounded-[24px] bg-card p-4 text-left transition active:scale-[.98]"
        >
          <IconBubble name={it.icon} tint={it.tint} />
          <span className="mt-3 block">
            <span className="block text-[16px] font-semibold leading-snug text-ink">{it.title}</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted">{it.sub}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
