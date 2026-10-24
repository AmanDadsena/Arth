import type { Season } from '@/lib/api/types'

export const SEASONS: Season[] = ['kharif', 'rabi', 'zaid']

/** Kharif Jun–Sep, rabi Oct–Feb, zaid (summer) Mar–May. */
export function seasonFor(date = new Date()): Season {
  const m = date.getMonth() + 1
  if (m >= 6 && m <= 9) return 'kharif'
  if (m >= 3 && m <= 5) return 'zaid'
  return 'rabi'
}

/** ISO date `days` after an ISO date, in local time. */
export function addDays(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
