const e = import.meta.env

export const env = {
  apiBaseUrl: ((e.VITE_API_BASE_URL as string | undefined) || '/api').replace(/\/$/, ''),
  useMocks: e.VITE_USE_MOCKS === 'true',
}
