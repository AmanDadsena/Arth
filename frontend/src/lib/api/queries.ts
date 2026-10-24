import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './client'
import type { FarmerProfile, FarmerProfileInput } from './types'

/** Shared TanStack Query setup + the profile hooks every feature reads. */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404 || err.status === 400)) return false
        return count < 2
      },
    },
    mutations: { retry: false },
  },
})

export const qk = {
  farmer: ['farmer'] as const,
  brief: (lang: string) => ['brief', lang] as const,
  weather: (lat: number, lon: number, lang: string) => ['weather', lat, lon, lang] as const,
  mandiPrices: (commodity: string, lat: number, lon: number) => ['mandi', commodity, lat, lon] as const,
  calendar: (season: string, lang: string) => ['calendar', season, lang] as const,
  soil: (lang: string, lat?: number, lon?: number) => ['soil', lang, lat, lon] as const,
  health: ['health'] as const,
}

export function isNotFound(err: unknown) {
  return err instanceof ApiError && err.status === 404
}

/** The farmer's profile. `data` is undefined until loaded; a 404 means "no profile yet". */
export function useFarmer(enabled = true) {
  return useQuery<FarmerProfile, Error>({ queryKey: qk.farmer, queryFn: api.getFarmer, enabled, staleTime: Infinity })
}

export function useSaveFarmer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: FarmerProfileInput) => api.putFarmer(p),
    onSuccess: (saved) => {
      qc.setQueryData(qk.farmer, saved)
      // anything computed from the old profile (brief, prices by location) is stale now
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'farmer' })
    },
  })
}

/** Whether this backend can share anonymous records with the cloud (hides the opt-in if not). */
export function useCloudSync() {
  const q = useQuery({ queryKey: qk.health, queryFn: api.getHealth, staleTime: 5 * 60_000, retry: false })
  return q.data?.cloudSync === true
}

/** Strip server-owned fields before a PUT. */
export function toInput(p: FarmerProfile): FarmerProfileInput {
  const { createdAt: _c, updatedAt: _u, ...rest } = p
  return rest
}

/** ~1 km precision — never send or store more than that. */
export const round2 = (n: number) => Math.round(n * 100) / 100
