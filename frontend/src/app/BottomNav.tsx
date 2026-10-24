import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '@/components/ui'

/** Rutu's floating ink pill: the active tab grows a cream pill with its label. */

const TABS: { key: string; path: string; icon: IconName }[] = [
  { key: 'home', path: '/', icon: 'home' },
  { key: 'doctor', path: '/doctor', icon: 'doctor' },
  { key: 'mandi', path: '/mandi', icon: 'mandi' },
  { key: 'calendar', path: '/calendar', icon: 'calendar' },
  { key: 'profile', path: '/profile', icon: 'profile' },
]

export const NAV_PATHS = TABS.map((t) => t.path)

export function BottomNav() {
  const { t } = useTranslation('nav')
  const nav = useNavigate()
  const { pathname } = useLocation()

  return (
    <nav
      aria-label="Main"
      className="absolute bottom-[max(16px,env(safe-area-inset-bottom))] left-3 right-3 z-20 flex h-[68px] items-center justify-between rounded-[34px] bg-ink px-2 shadow-[0_14px_34px_rgba(23,21,15,.32)]"
    >
      {TABS.map((tab) => {
        const active = tab.path === '/' ? pathname === '/' : pathname.startsWith(tab.path)
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => nav(tab.path)}
            aria-current={active ? 'page' : undefined}
            aria-label={t(tab.key)}
            className={`flex h-[52px] min-w-[52px] items-center justify-center gap-1.5 rounded-[26px] px-3 transition ${
              active ? 'bg-[#F4F1E6] text-ink' : 'text-ghost'
            }`}
          >
            <Icon name={tab.icon} />
            {active ? <span className="max-w-[78px] truncate text-[14px] font-semibold">{t(tab.key)}</span> : null}
          </button>
        )
      })}
    </nav>
  )
}
