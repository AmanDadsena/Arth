import type { Auth } from 'firebase/auth'
import { env } from './env'

/**
 * Firebase Auth, loaded on first use so the SDK never weighs on demo mode or
 * on builds without sign-in configured. Only Google sign-in is used.
 */

let authPromise: Promise<Auth> | null = null

export function getFirebaseAuth(): Promise<Auth> {
  if (!env.firebase) return Promise.reject(new Error('firebase-not-configured'))
  authPromise ??= Promise.all([import('firebase/app'), import('firebase/auth')]).then(([app, auth]) => {
    const instance = auth.getAuth(app.initializeApp(env.firebase!))
    instance.useDeviceLanguage()
    return instance
  })
  return authPromise
}
