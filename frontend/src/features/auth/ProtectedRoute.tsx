import { useEffect, useRef, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { isNotFound, useFarmer } from '@/lib/api/queries'
import { ErrorState } from '@/components/ui'
import { setLang } from '@/i18n'
import { useAuth } from './useAuth'
import { getLocalConsent } from './AuthProvider'

/** Calm full-screen placeholder while auth or the profile resolves. */
export function BootScreen() {
  return (
    <div className="flex h-dvh items-center justify-center bg-screen" role="status" aria-label="Loading">
      <div className="display animate-pulse text-[56px] text-ink/70">अर्थ</div>
    </div>
  )
}

/**
 * Signed in with Google → profile with consent → children.
 * No profile: /consent first, then /onboarding. `requireProfile={false}` is for
 * those two screens themselves.
 */
export function ProtectedRoute({ children, requireProfile = true }: { children: ReactNode; requireProfile?: boolean }) {
  const { status } = useAuth()
  const location = useLocation()
  const authed = status === 'signedIn'
  const farmer = useFarmer(authed)

  // follow the profile's language once per load, so a returning farmer lands in theirs
  const synced = useRef(false)
  useEffect(() => {
    if (farmer.data && !synced.current) {
      synced.current = true
      setLang(farmer.data.lang)
    }
  }, [farmer.data])

  if (status === 'loading') return <BootScreen />
  if (!authed) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!requireProfile) return <>{children}</>

  if (farmer.isPending) return <BootScreen />
  if (farmer.isError) {
    if (isNotFound(farmer.error)) return <Navigate to={getLocalConsent() ? '/onboarding' : '/consent'} replace />
    return (
      <div className="flex h-dvh items-center bg-screen px-5">
        <div className="w-full">
          <ErrorState error={farmer.error} onRetry={() => void farmer.refetch()} />
        </div>
      </div>
    )
  }
  if (!farmer.data.consentAt) return <Navigate to="/consent" replace />
  return <>{children}</>
}
