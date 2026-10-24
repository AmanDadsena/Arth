const e = import.meta.env

const firebase = {
  apiKey: (e.VITE_FIREBASE_API_KEY as string | undefined) ?? '',
  authDomain: (e.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? '',
  projectId: (e.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? '',
  appId: (e.VITE_FIREBASE_APP_ID as string | undefined) ?? '',
}

export const env = {
  apiBaseUrl: ((e.VITE_API_BASE_URL as string | undefined) || '/api').replace(/\/$/, ''),
  /** Google sign-in (the only way in) needs every Firebase web-config value (they are public by design). */
  firebase: Object.values(firebase).every(Boolean) ? firebase : null,
}
