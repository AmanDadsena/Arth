import type { TFunction } from 'i18next'
import type { Lang } from '@/lib/api/types'
import { fmtDate } from '@/i18n'

function isoLocal(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * "Today" / "Tomorrow" for the next two days, then the localized short
 * weekday ("Mon", "सोम", "सोम") via Intl.
 * `t` must be bound to the weather namespace.
 */
export function dayName(date: string, lang: Lang, t: TFunction<'weather'>, opts: { tomorrow?: boolean } = {}) {
  const now = new Date()
  const today = isoLocal(now)
  const tomorrow = isoLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const day = date.slice(0, 10)
  if (day === today) return t('today')
  if (opts.tomorrow !== false && day === tomorrow) return t('tomorrow')
  return fmtDate(day, lang, { weekday: 'short' })
}
