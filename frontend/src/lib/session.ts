/**
 * The seam between the API client and Google sign-in (Firebase Auth): the
 * AuthProvider registers a token getter and the client attaches
 * `Authorization: Bearer <token>` to every request.
 */

type TokenGetter = () => Promise<string | null>

let tokenGetter: TokenGetter | null = null

export function registerTokenGetter(fn: TokenGetter | null) {
  tokenGetter = fn
}

export async function getIdToken(): Promise<string | null> {
  return tokenGetter ? tokenGetter() : null
}
