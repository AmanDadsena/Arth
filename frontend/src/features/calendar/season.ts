import type { Season } from '@/lib/api/types'

export const SEASONS: Season[] = ['kharif', 'rabi', 'zaid']

/** ISO date `days` after an ISO date, in local time. */
export function addDays(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
