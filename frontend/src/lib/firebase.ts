import type { Auth } from 'firebase/auth'
import { env } from './env'

/**
 * Firebase Auth, loaded on first use so the SDK stays out of the first paint.
 * Google sign-in is the only way in.
 */

type AuthModule = typeof import('firebase/auth')

let authPromise: Promise<Auth> | null = null
let ready: { auth: Auth; mod: AuthModule } | null = null

export function getFirebaseAuth(): Promise<Auth> {
  if (!env.firebase) return Promise.reject(new Error('firebase-not-configured'))
  authPromise ??= Promise.all([import('firebase/app'), import('firebase/auth')]).then(([app, mod]) => {
    const instance = mod.getAuth(app.initializeApp(env.firebase!))
    instance.useDeviceLanguage()
    ready = { auth: instance, mod }
    return instance
  })
  return authPromise
}

/**
 * The loaded SDK, or null while it is still downloading. Sign-in uses this to
 * open Google's popup synchronously inside the click: browsers block or delay a
 * popup opened after an `await`, which is what made sign-in fail on slow networks.
 */
export function firebaseReady(): { auth: Auth; mod: AuthModule } | null {
  return ready
}
