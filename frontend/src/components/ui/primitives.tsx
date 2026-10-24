import type { HTMLAttributes, ReactNode } from 'react'

/** Shared primitives, token-for-token with Rutu's design. */

export function Card({ children, className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-[28px] bg-card ${className}`} {...rest}>
      {children}
    </div>
  )
}

type ChipTone = 'neutral' | 'grow' | 'white' | 'warn' | 'amber'
const CHIP: Record<ChipTone, string> = {
  neutral: 'bg-chip text-ink-2',
  grow: 'bg-grow-l text-grow-d',
  white: 'bg-card text-ink-2',
  warn: 'bg-warn-l text-warn-d',
  amber: 'bg-amber-l text-amber',
}

/** Static chip. For a tappable/selectable chip, pass onClick + selected. */
export function Chip({
  children,
  tone = 'neutral',
  className = '',
  onClick,
  selected,
}: {
  children: ReactNode
  tone?: ChipTone
  className?: string
  onClick?: () => void
  selected?: boolean
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={`min-h-11 rounded-2xl px-4 py-2 text-[15px] font-semibold transition ${
          selected ? 'bg-grow text-white' : 'bg-card text-ink-2 active:bg-chip'
        } ${className}`}
      >
        {children}
      </button>
    )
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-1.5 text-sm font-medium ${CHIP[tone]} ${className}`}>
      {children}
    </span>
  )
}

type BadgeTone = 'grow' | 'warn' | 'amber' | 'danger' | 'neutral'
const BADGE: Record<BadgeTone, string> = {
  grow: 'bg-grow-l text-grow-d',
  warn: 'bg-warn-l text-warn-m',
  amber: 'bg-amber-l text-amber',
  danger: 'bg-danger-l text-danger',
  neutral: 'bg-chip text-muted',
}

export function Badge({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold ${BADGE[tone]} ${className}`}>{children}</span>
}

export function EyebrowLabel({ children, tone = 'faint' }: { children: ReactNode; tone?: 'faint' | 'warn' | 'ghost' }) {
  const tones = { faint: 'text-faint', warn: 'text-warn-m', ghost: 'text-ghost' }
  return <div className={`text-[13px] font-semibold uppercase tracking-[1.6px] ${tones[tone]}`}>{children}</div>
}

/** The big-number treatment: value large, unit small and muted beside it. */
export function BigValue({ value, unit, size = 60, tone = 'ink' }: { value: ReactNode; unit?: ReactNode; size?: number; tone?: 'ink' | 'grow' | 'card' | 'warn' }) {
  const tones = { ink: 'text-ink', grow: 'text-grow', card: 'text-card', warn: 'text-warn-d' }
  return (
    <div className="flex items-baseline gap-2.5">
      <span className={`display leading-none ${tones[tone]}`} style={{ fontSize: size }}>
        {value}
      </span>
      {unit ? <span className="text-[15px] font-medium text-faint">{unit}</span> : null}
    </div>
  )
}

export function SectionHead({ children, action, onAction }: { children: ReactNode; action?: ReactNode; onAction?: () => void }) {
  return (
    <div className="mx-1 mb-3 mt-6 flex items-baseline justify-between">
      <h2 className="display text-[22px] text-ink">{children}</h2>
      {action ? (
        <button type="button" onClick={onAction} className="min-h-11 text-[15px] font-semibold text-grow">
          {action}
        </button>
      ) : null}
    </div>
  )
}
