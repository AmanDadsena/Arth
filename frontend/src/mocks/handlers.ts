import { http, passthrough } from 'msw'
import { env } from '@/lib/env'
import { resolveMock } from './resolve'

/** Dev-time MSW handlers — every endpoint delegates to the shared resolver. */

async function readBody(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'DELETE') return undefined
  const type = request.headers.get('content-type') ?? ''
  if (type.includes('multipart/form-data')) return request.formData()
  if (type.includes('application/json')) return request.json()
  return undefined
}

const ROUTES: [keyof typeof http, string][] = [
  ['get', '/farmer/me'],
  ['put', '/farmer/me'],
  ['delete', '/farmer/me'],
  ['get', '/brief'],
  ['get', '/weather'],
  ['get', '/mandi/prices'],
  ['post', '/mandi/sell-advice'],
  ['post', '/ai/crop-doctor'],
  ['post', '/ai/label-reader'],
  ['post', '/ai/explain-document'],
  ['post', '/ai/voice'],
  ['get', '/calendar'],
  ['post', '/schemes/match'],
]

// Match only API calls under the base URL — a bare `*/weather` would also
// catch the browser loading the /weather page itself.
export const handlers = [
  ...ROUTES.map(([method, path]) => {
    const make = http[method] as typeof http.get
    return make(`${env.apiBaseUrl}${path}`, async ({ request }) => {
      const url = new URL(request.url)
      return resolveMock(request.method, path + url.search, await readBody(request))
    })
  }),
  // the resolver's own live-data calls go straight to the network
  http.get('https://api.open-meteo.com/*', () => passthrough()),
  http.get('https://api.data.gov.in/*', () => passthrough()),
]
