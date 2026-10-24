import type { Lang } from '@/lib/api/types'

/**
 * Calendar dates for live data. Everything is a farmer's day in India, so the
 * "today" here is the date in Asia/Kolkata (the zone Open-Meteo and the mandi
 * feed report in), never the UTC date a raw toISOString() would give.
 */

const IST = 'Asia/Kolkata'
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' })

/** today's date in India, `YYYY-MM-DD` */
export function todayIso(now: Date = new Date()): string {
  return ymd.format(now)
}

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
}

/** `iso` shifted by `n` calendar days */
export function addDaysIso(iso: string, n: number): string {
  const d = toUtc(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** whole days from `a` to `b` (b - a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000)
}

/** `dd/mm/yyyy` (the mandi feed's format) → `YYYY-MM-DD`, or null */
export function fromDmy(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim())
  if (!m) return null
  return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
}

export const LOCALE: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' }
const REL: Record<Lang, [string, string]> = { en: ['today', 'tomorrow'], hi: ['आज', 'कल'], mr: ['आज', 'उद्या'] }

/** 'today' / 'tomorrow' (आज / उद्या …) relative to today, otherwise the weekday name */
export function dayWord(date: string, lang: Lang, today: string = todayIso()): string {
  const diff = daysBetween(today, date)
  if (diff === 0 || diff === 1) return REL[lang][diff]
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long', timeZone: 'UTC' }).format(toUtc(date))
}

/** short localized date, e.g. "15 Nov" / "१५ नोव्हें" */
export function shortDate(date: string, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(toUtc(date))
}
