import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { User } from 'firebase/auth'
import { api, setUnauthorizedHandler } from '@/lib/api/client'
import { env } from '@/lib/env'
import { firebaseReady, getFirebaseAuth } from '@/lib/firebase'
import { registerTokenGetter } from '@/lib/session'
import { LANG_KEY } from '@/i18n'

/**
 * Who is using the app: a Google account (Firebase Auth), the only way in.
 * Screens only read this context.
 */

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'

export interface AuthContextValue {
  status: AuthStatus
  displayName: string
  email: string | null
  /** false when the Firebase web config is missing from the build */
  canSignIn: boolean
  signInWithGoogle: () => Promise<void>
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

function initialStatus(): AuthStatus {
  return env.firebase ? 'loading' : 'signedOut' // loading until Firebase restores (or not) the last session
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [status, setStatus] = useState<AuthStatus>(initialStatus)
  const [user, setUser] = useState<User | null>(null)

  // Firebase: follow the signed-in Google account and hand its ID token to the API client.
  useEffect(() => {
    if (!env.firebase) return
    let unsubscribe = () => {}
    let cancelled = false
    void getFirebaseAuth().then(async (auth) => {
      const { onIdTokenChanged } = await import('firebase/auth')
      if (cancelled) return
      unsubscribe = onIdTokenChanged(auth, (u) => {
        setUser(u)
        // the SDK refreshes the one-hour token itself; getIdToken() returns the fresh one
        registerTokenGetter(u ? () => u.getIdToken() : null)
        setStatus(u ? 'signedIn' : 'signedOut')
      })
    }, () => setStatus((s) => (s === 'loading' ? 'signedOut' : s)))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const signOut = useCallback(async () => {
    if (env.firebase) {
      try {
        const [auth, { signOut: fbSignOut }] = await Promise.all([getFirebaseAuth(), import('firebase/auth')])
        await fbSignOut(auth)
      } catch {
        /* still clear everything below */
      }
    }
    qc.clear()
    clearLocal()
    setStatus('signedOut')
    if (env.firebase) {
      // Full reload, not a client-side route change: clearLocal() also removes the storage
      // the live Firebase SDK uses for sign-in, and signing in again in the same page then
      // fails with auth/internal-error. A fresh page also drops the last user's data from memory.
      window.location.replace('/login')
      return
    }
    nav('/login', { replace: true })
  }, [qc, nav])

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut())
  }, [signOut])

  const signInWithGoogle = useCallback(async () => {
    if (env.firebase) {
      // Normally loaded at app start, so nothing is awaited before the popup opens and
      // the browser still counts it as part of the click. Only on a very slow first load
      // do we wait here; then the popup may be blocked and a second tap works.
      let fb = firebaseReady()
      if (!fb) {
        await getFirebaseAuth()
        fb = firebaseReady()
      }
      if (!fb) throw new Error('firebase-not-loaded')
      const provider = new fb.mod.GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      qc.clear()
      try {
        await fb.mod.signInWithPopup(fb.auth, provider) // onIdTokenChanged sets status
      } catch (err) {
        // The code (e.g. auth/popup-blocked, auth/unauthorized-domain) says what to fix; it holds no personal data.
        if (import.meta.env.DEV) console.warn('Google sign-in failed:', (err as { code?: string }).code ?? err)
        throw err
      }
      return
    }
    throw new Error('sign-in-not-configured')
  }, [qc])

  const deleteAccount = useCallback(async () => {
    await api.deleteFarmer() // server data first: it needs the still-valid token
    if (env.firebase) {
      try {
        const [auth, { deleteUser }] = await Promise.all([getFirebaseAuth(), import('firebase/auth')])
        if (auth.currentUser) await deleteUser(auth.currentUser)
      } catch {
        /* Firebase may ask for a recent sign-in; the farm data is already gone */
      }
    }
    await signOut()
  }, [signOut])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      displayName: user?.displayName ?? '',
      email: status === 'signedIn' ? (user?.email ?? null) : null,
      canSignIn: !!env.firebase,
      signInWithGoogle,
      signOut,
      deleteAccount,
    }),
    [status, user, signInWithGoogle, signOut, deleteAccount],
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
