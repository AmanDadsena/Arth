import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api, setUnauthorizedHandler } from '@/lib/api/client'
import { DEMO_FARMER, isDemo, setDemo } from '@/lib/demo'
import { signInAvailable } from '@/lib/session'
import { LANG_KEY, currentLang } from '@/i18n'

/**
 * Who is using the app. Today that is the demo farmer only; Google sign-in
 * plugs in later by setting status 'signedIn' and registering a token getter
 * in lib/session — no screen needs to change when it does.
 */

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'demo'

export interface AuthContextValue {
  status: AuthStatus
  displayName: string
  email: string | null
  /** false until a real sign-in provider is wired in */
  canSignIn: boolean
  signInWithGoogle: () => Promise<void>
  startDemo: () => void
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

const CONSENT_KEY = 'arth.consentAt'

/** Remove everything Arth keeps on the device except the language choice. */
function clearLocal() {
  try {
    const lang = localStorage.getItem(LANG_KEY)
    localStorage.clear()
    sessionStorage.clear()
    if (lang) localStorage.setItem(LANG_KEY, lang)
  } catch {
    /* storage blocked */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [status, setStatus] = useState<AuthStatus>(() => (isDemo() ? 'demo' : 'signedOut'))

  const signOut = useCallback(async () => {
    setDemo(false)
    qc.clear()
    clearLocal()
    setStatus('signedOut')
    nav('/login', { replace: true })
  }, [qc, nav])

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut())
  }, [signOut])

  const signInWithGoogle = useCallback(async () => {
    throw new Error('sign-in-not-configured')
  }, [])

  const startDemo = useCallback(() => {
    qc.clear()
    setDemo(true)
    try {
      // the demo farmer speaks whatever language was picked on the login screen
      localStorage.setItem('arth.demo.profile', JSON.stringify({ ...DEMO_FARMER, lang: currentLang() }))
    } catch {
      /* resolver falls back to DEMO_FARMER */
    }
    setStatus('demo')
    nav('/', { replace: true })
  }, [qc, nav])

  const deleteAccount = useCallback(async () => {
    await api.deleteFarmer()
    await signOut()
  }, [signOut])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      displayName: status === 'demo' ? DEMO_FARMER.name : '',
      email: null,
      canSignIn: signInAvailable(),
      signInWithGoogle,
      startDemo,
      signOut,
      deleteAccount,
    }),
    [status, signInWithGoogle, startDemo, signOut, deleteAccount],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function getLocalConsent(): string | null {
  try {
    return localStorage.getItem(CONSENT_KEY)
  } catch {
    return null
  }
}

export function setLocalConsent(at: string) {
  try {
    localStorage.setItem(CONSENT_KEY, at)
  } catch {
    /* the profile carries consentAt once onboarding saves it */
  }
}
