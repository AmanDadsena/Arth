import type { Lang, Season, WeatherDay, WhyNow } from '@/lib/api/types'

/**
 * "Why sow this crop now" for the crop calendar: signals from the live
 * forecast, from mandi price trends, and real dated news with sources.
 * Owned by the calendar feature; the mock resolver calls it for GET /calendar.
 */
export interface InsightContext {
  /** next days of forecast for the farmer's location (live when online) */
  forecast: WeatherDay[]
  /** 7-day mandi price change in % by commodity id, e.g. { onion: 1.7 } */
  priceChangePct: Record<string, number>
}

export function whyNowFor(_crop: string, _season: Season, _lang: Lang, _ctx: InsightContext): WhyNow {
  return { weather: [], market: [], news: [] }
}
