import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/useAuth'
import { SkeletonScreen } from '@/components/ui'
import { BottomNav, NAV_PATHS } from './BottomNav'
import { MicSlot } from './MicSlot'

/**
 * On a laptop (the demo case) the app sits inside a phone bezel on the canvas,
 * exactly like Rutu. On an actual phone the bezel is dropped and it fills the screen.
 */
function useIsWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && document.documentElement.clientWidth >= 500)
  useEffect(() => {
    const on = () => setWide(document.documentElement.clientWidth >= 500)
    const ro = new ResizeObserver(on)
    ro.observe(document.documentElement)
    return () => ro.disconnect()
  }, [])
  return wide
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  const wide = useIsWide()
  if (!wide) return <div className="relative h-dvh w-full overflow-hidden bg-screen">{children}</div>
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-9">
      <div
        className="relative overflow-hidden bg-screen"
        style={{ width: 390, height: 844, borderRadius: 44, boxShadow: '0 30px 70px rgba(30,26,16,.28), 0 0 0 10px #17150F, 0 0 0 11px #35312a' }}
      >
        {children}
      </div>
    </div>
  )
}

function DemoBanner() {
  const { t } = useTranslation('common')
  const { signOut } = useAuth()
  return (
    <div className="flex items-center justify-between gap-2 bg-ink px-4 py-1.5 text-[12px] font-medium text-white/85">
      <span className="truncate">{t('demoBanner')}</span>
      <button type="button" onClick={() => void signOut()} className="flex-none rounded-lg bg-white/15 px-2 py-1 font-semibold text-white">
        {t('exitDemo')}
      </button>
    </div>
  )
}

/** The app shell: scrolling screen, bottom nav on the five main tabs, mic everywhere. */
export function Layout() {
  const { pathname, key } = useLocation()
  const { status } = useAuth()
  const showNav = NAV_PATHS.includes(pathname)

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        {status === 'demo' ? <DemoBanner /> : null}
        <main key={key} className="sc fade relative flex-1 overflow-y-auto overflow-x-hidden">
          {/* bottom room for the nav and the floating mic, so neither covers the last row */}
          <div className={`px-4 pt-4 ${showNav ? 'pb-[180px]' : 'pb-[100px]'}`}>
            <Suspense fallback={<SkeletonScreen />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <MicSlot raised={showNav} />
      {showNav ? <BottomNav /> : null}
    </PhoneFrame>
  )
}
