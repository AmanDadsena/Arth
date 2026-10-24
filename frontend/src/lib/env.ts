const e = import.meta.env

const firebase = {
  apiKey: (e.VITE_FIREBASE_API_KEY as string | undefined) ?? '',
  authDomain: (e.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? '',
  projectId: (e.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? '',
  appId: (e.VITE_FIREBASE_APP_ID as string | undefined) ?? '',
}

export const env = {
  apiBaseUrl: ((e.VITE_API_BASE_URL as string | undefined) || '/api').replace(/\/$/, ''),
  useMocks: e.VITE_USE_MOCKS === 'true',
  /** Google sign-in is on only when every Firebase web-config value is set (they are public by design). */
  firebase: Object.values(firebase).every(Boolean) ? firebase : null,
  /**
   * `npm run dev` only: sign in without Google against a backend started with
   * ARTH_AUTH_DISABLED=true (which that backend refuses in production).
   * Never active in a production build.
   */
  devSignIn: e.DEV && e.VITE_DEV_SIGN_IN === 'true',
}
