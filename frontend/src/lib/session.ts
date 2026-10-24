/**
 * The seam between the API client and whatever signs the farmer in.
 *
 * Google sign-in (Firebase Auth) plugs in here later: it registers a token
 * getter and the client attaches `Authorization: Bearer <token>` to every
 * request. Until then no provider is registered and only demo mode can sign in.
 */

type TokenGetter = () => Promise<string | null>

let tokenGetter: TokenGetter | null = null

export function registerTokenGetter(fn: TokenGetter | null) {
  tokenGetter = fn
}

export async function getIdToken(): Promise<string | null> {
  return tokenGetter ? tokenGetter() : null
}

/** True once a real sign-in provider has been wired in. */
export function signInAvailable() {
  return tokenGetter !== null
}
