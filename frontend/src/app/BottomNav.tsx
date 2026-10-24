import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '@/components/ui'

/**
 * A white pill floating over the screen. Every tab keeps its icon and a short
 * label (many of our farmers read little, so icons alone are not enough); the
 * active icon sits on a green pill that slides between tabs. With `withMic`
 * the bar stops short so the voice button (placed by Layout, see MicSlot) gets
 * its own green circle beside it.
 */

const TABS: { key: string; path: string; icon: IconName }[] = [
  { key: 'home', path: '/', icon: 'home' },
  { key: 'doctor', path: '/doctor', icon: 'doctor' },
  { key: 'mandi', path: '/mandi', icon: 'mandi' },
  { key: 'calendar', path: '/calendar', icon: 'calendar' },
  { key: 'profile', path: '/profile', icon: 'profile' },
]

export const NAV_PATHS = TABS.map((t) => t.path)

/** The short label under each tab: `nav.tab.*` when present, else the screen name. */
function useTabLabel() {
  const { t, i18n } = useTranslation('nav')
  return (key: string) => (i18n.exists(`nav:tab.${key}`) ? t(`tab.${key}`) : t(key))
}

export function BottomNav({ withMic = false }: { withMic?: boolean }) {
  const { t } = useTranslation('nav')
  const label = useTabLabel()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const activeIndex = TABS.findIndex((tab) => (tab.path === '/' ? pathname === '/' : pathname.startsWith(tab.path)))

  return (
    <>
      <div aria-hidden className="arth-nav-scrim" />
      <nav aria-label={t('main', { defaultValue: 'Main' })} className="arth-nav" data-mic={withMic || undefined}>
        <div className="arth-nav-tabs">
          {activeIndex >= 0 ? (
            <span aria-hidden className="arth-nav-thumb" style={{ transform: `translateX(${activeIndex * 100}%)` }}>
              <span />
            </span>
          ) : null}
          {TABS.map((tab, i) => {
            const active = i === activeIndex
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => nav(tab.path)}
                aria-current={active ? 'page' : undefined}
                className="arth-nav-tab"
                data-active={active || undefined}
              >
                <span className="arth-nav-icon">
                  <Icon name={tab.icon} size={23} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className="arth-nav-label">
                  {label(tab.key)}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
