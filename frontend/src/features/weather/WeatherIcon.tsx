import type { ReactNode } from 'react'
import type { WeatherCondition } from '@/lib/api/types'

/**
 * Weather glyphs in the same stroke style as the shared Icon set (24px grid,
 * 2px round strokes). Colour follows the sky: sun in amber, rain in green
 * (water is good news for a farm), storms in orange (risk), grey for cloud/fog.
 */

const SUN_RAYS = 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4'
const CLOUD = 'M7 18.5a4.5 4.5 0 1 1 1.2-8.8A5.5 5.5 0 0 1 19 12a3.5 3.5 0 0 1-1 6.5z'
const CLOUD_HIGH = 'M7 15a4.5 4.5 0 1 1 1.2-8.8A5.5 5.5 0 0 1 19 8.5a3.5 3.5 0 0 1-.5 6.5'

const PATHS: Record<WeatherCondition, ReactNode> = {
  clear: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d={SUN_RAYS} />
    </>
  ),
  partly_cloudy: (
    <>
      <path d="M8.5 4.5v1.2M3.8 9.2h1.2M5.2 5.9l.9.9M11.8 5.9l-.9.9" />
      <path d="M5.6 12.4A3.6 3.6 0 1 1 11.6 8.6" />
      <path d="M9 20a3.8 3.8 0 1 1 1-7.5 4.6 4.6 0 0 1 8.8 1.4A3.1 3.1 0 0 1 18 20z" />
    </>
  ),
  cloudy: <path d={CLOUD} />,
  rain: (
    <>
      <path d={CLOUD_HIGH} />
      <path d="M8.5 18l-1 2.5M12.5 17.5l-1 3M16.5 18l-1 2.5" />
    </>
  ),
  heavy_rain: (
    <>
      <path d={CLOUD_HIGH} />
      <path d="M7 17.5l-1.2 3M10.3 17.5l-1.2 3.5M13.6 17.5l-1.2 3.5M16.9 17.5l-1.2 3" />
    </>
  ),
  thunderstorm: (
    <>
      <path d={CLOUD_HIGH} />
      <path d="M12.5 13.5 10 17.5h3.5l-2 4" />
    </>
  ),
  fog: <path d="M4 8h16M3 12h18M5 16h14M8 20h8" />,
}

const TONE: Record<WeatherCondition, string> = {
  clear: 'text-amber',
  partly_cloudy: 'text-amber',
  cloudy: 'text-muted',
  rain: 'text-grow',
  heavy_rain: 'text-grow-d',
  thunderstorm: 'text-warn',
  fog: 'text-muted',
}

export function WeatherIcon({ condition, size = 28, className, strokeWidth = 2 }: { condition: WeatherCondition; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-none ${className ?? TONE[condition] ?? 'text-muted'}`}
    >
      {PATHS[condition] ?? PATHS.cloudy}
    </svg>
  )
}

/** Rain-probability colour: > 60 % is risk for spraying, 30–60 % caution, else calm green
 * (grow at 40 %: the pale grow-l token vanishes against the card's track). */
export function rainTone(p: number): { bar: string; text: string } {
  if (p > 60) return { bar: 'bg-warn', text: 'text-warn-d' }
  if (p >= 30) return { bar: 'bg-amber', text: 'text-amber' }
  return { bar: 'bg-grow/40', text: 'text-muted' }
}
