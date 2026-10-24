import type { ReactNode } from 'react'

/**
 * Line drawings for onboarding, in the same hand as the shared Icon set
 * (24 px grid, 2 px round strokes, currentColor): one per question, one per
 * crop, one per water source. Calmer than emoji and identical on every phone.
 */

const G = {
  // questions
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5z" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20c.8-4 3.7-6.2 7.5-6.2s6.7 2.2 7.5 6.2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21z" />
      <circle cx="12" cy="9.8" r="2.4" />
    </>
  ),
  field: (
    <>
      <path d="M3 18.5 7.5 7h9L21 18.5z" />
      <path d="M9.6 7 8 18.5M14.4 7l1.6 11.5M5.2 12.8h13.6" />
    </>
  ),
  water: <path d="M12 3.5s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  sprout: (
    <>
      <path d="M12 20.5V11" />
      <path d="M12 11c0-3.6-2.6-6-6.5-6 0 3.6 2.6 6 6.5 6zM12 13.5c0-3.2 2.3-5.5 6-5.5 0 3.2-2.3 5.5-6 5.5z" />
    </>
  ),
  // crops
  onion: (
    <>
      <path d="M12 8.5c4.2 1.6 6.5 4.3 6.5 7.2 0 2.9-2.9 4.8-6.5 4.8s-6.5-1.9-6.5-4.8c0-2.9 2.3-5.6 6.5-7.2z" />
      <path d="M12 8.5V3.5M12 6l-2.5-2.5M12 6l2.5-2.5M12 11.5c-1.8 1.6-2.6 3.6-2.4 6.2M12 11.5c1.8 1.6 2.6 3.6 2.4 6.2" />
    </>
  ),
  soybean: (
    <>
      <path d="M6.5 18.5c-1.8-1.8-1.3-5 1.2-7.5l4.3-4.3c2.5-2.5 5.7-3 7.5-1.2s1.3 5-1.2 7.5L14 17.3c-2.5 2.5-5.7 3-7.5 1.2z" />
      <circle cx="9.5" cy="14.5" r="1.3" />
      <circle cx="12.6" cy="11.4" r="1.3" />
      <circle cx="15.7" cy="8.3" r="1.3" />
    </>
  ),
  tomato: (
    <>
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 6.5V4M8.8 7.6 12 9l3.2-1.4M12 9l-1.6 2M12 9l1.6 2" />
    </>
  ),
  grapes: (
    <>
      <path d="M12 6V3.5M12 4.5c1.5-1 3-1.2 4.5-.5" />
      <circle cx="9" cy="8.5" r="2.2" />
      <circle cx="15" cy="8.5" r="2.2" />
      <circle cx="12" cy="11.5" r="2.2" />
      <circle cx="9" cy="14.5" r="2.2" />
      <circle cx="15" cy="14.5" r="2.2" />
      <circle cx="12" cy="17.8" r="2.2" />
    </>
  ),
  cotton: (
    <>
      <path d="M12 12.5a3 3 0 1 1-3-4.4 3 3 0 0 1 6 0 3 3 0 1 1-3 4.4z" />
      <path d="M8.2 13.2a3 3 0 1 0 3.8 3.2 3 3 0 1 0 3.8-3.2" />
      <path d="M12 16.4V21M9 21h6" />
    </>
  ),
  wheat: (
    <>
      <path d="M12 21V5.5" />
      <path d="M12 5.5c-1.6-.4-2.4-1.5-2.4-3 1.6.4 2.4 1.5 2.4 3zm0 0c1.6-.4 2.4-1.5 2.4-3-1.6.4-2.4 1.5-2.4 3z" />
      <path d="M12 10c-2-.3-3.2-1.6-3.3-3.5 2 .3 3.2 1.6 3.3 3.5zm0 0c2-.3 3.2-1.6 3.3-3.5-2 .3-3.2 1.6-3.3 3.5z" />
      <path d="M12 14.5c-2-.3-3.2-1.6-3.3-3.5 2 .3 3.2 1.6 3.3 3.5zm0 0c2-.3 3.2-1.6 3.3-3.5-2 .3-3.2 1.6-3.3 3.5z" />
    </>
  ),
  gram: (
    <>
      <path d="M14.5 5.2c3.4 1 5.3 4 4.6 7.6-.8 4-4.6 6.9-8.6 6.7-3.6-.2-6-2.9-5.8-6.2.2-2.4 1.8-4.1 4-4.7" />
      <path d="M8.7 8.6c.1-2.1 1.2-3.6 3.1-4.3 1-.4 1.9-.1 2.7.9" />
      <path d="M11.8 4.3c-.3 1.3-.1 2.4.6 3.4" />
    </>
  ),
  sugarcane: (
    <>
      <path d="M9.5 21V6.5M14.5 21V9" />
      <path d="M8 11h3M8 16h3M13 13.5h3M13 18.5h3" />
      <path d="M9.5 6.5c-.5-2 .4-3.5 2.5-4-.2 2-1.1 3.4-2.5 4zM14.5 9c.2-2.2 1.6-3.4 3.8-3.4-.4 2-1.7 3.2-3.8 3.4z" />
    </>
  ),
  pomegranate: (
    <>
      <path d="M9.3 6.3a7 7 0 1 0 5.4 0" />
      <path d="M9.3 6.3 8.5 3.8l2 1.2L12 3.2 13.5 5l2-1.2-.8 2.5" />
      <path d="M9.3 6.3c1.7.6 3.7.6 5.4 0" />
    </>
  ),
  maize: (
    <>
      <path d="M12 3.5c2.4 2 3.4 5.2 3.4 8.7S14.4 19 12 20.5c-2.4-1.5-3.4-4.8-3.4-8.3S9.6 5.5 12 3.5z" />
      <path d="M12 4v16M8.8 9h6.4M8.6 13h6.8M9.2 17h5.6" />
      <path d="M8.8 15c-2.2-.5-3.6-2.2-3.8-4.6 1.8.6 3 1.8 3.6 3.5M15.2 15c2.2-.5 3.6-2.2 3.8-4.6-1.8.6-3 1.8-3.6 3.5" />
    </>
  ),
  // water sources
  rainfed: (
    <>
      <path d="M7 14.5a4.5 4.5 0 1 1 1.2-8.8A5.5 5.5 0 0 1 19 8a3.5 3.5 0 0 1-1 6.5z" />
      <path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5" />
    </>
  ),
  drip: (
    <>
      <path d="M3 7h18" />
      <path d="M7 7v2.5M12 7v2.5M17 7v2.5" />
      <path d="M7 12.5s1.6 1.8 1.6 3a1.6 1.6 0 0 1-3.2 0c0-1.2 1.6-3 1.6-3zM12 14s1.6 1.8 1.6 3a1.6 1.6 0 0 1-3.2 0c0-1.2 1.6-3 1.6-3zM17 12.5s1.6 1.8 1.6 3a1.6 1.6 0 0 1-3.2 0c0-1.2 1.6-3 1.6-3z" />
    </>
  ),
  sprinkler: (
    <>
      <path d="M12 21v-7M9 21h6M10.5 14h3" />
      <path d="M12 14c-1.5-3.5-4-5.5-8-6M12 14c1.5-3.5 4-5.5 8-6M12 11.5V5" />
      <path d="M4 5.5h.01M7 3.5h.01M17 3.5h.01M20 5.5h.01M12 3h.01" />
    </>
  ),
  canal: (
    <>
      <path d="M3 6.5 7 17.5h10l4-11" />
      <path d="M6.3 12c1.2-.8 2.4-.8 3.6 0s2.4.8 3.6 0 2.4-.8 3.6 0" />
      <path d="M7.6 15c.9-.6 1.9-.6 2.8 0s1.9.6 2.8 0 1.9-.6 2.8 0" />
    </>
  ),
  borewell: (
    <>
      <path d="M7 21V9h4v12M5 21h14" />
      <path d="M11 11h5.5a2 2 0 0 1 2 2v1" />
      <path d="M9 9V5.5M7 5.5h4" />
      <path d="M18.5 16.5s1.2 1.4 1.2 2.3a1.2 1.2 0 0 1-2.4 0c0-.9 1.2-2.3 1.2-2.3z" />
    </>
  ),
  edit: (
    <>
      <path d="M4.5 19.5l1-4.2L15.8 5a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L8.7 18.5z" />
      <path d="M13.8 7l3.2 3.2" />
    </>
  ),
  sunrise: (
    <>
      <path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0" />
      <path d="M12 4.5v3M4.8 9.8l2 1.4M19.2 9.8l-2 1.4M7.5 21h9" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type GlyphName = keyof typeof G

export function Glyph({ name, size = 24, className = '' }: { name: GlyphName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-none ${className}`}
    >
      {G[name]}
    </svg>
  )
}
