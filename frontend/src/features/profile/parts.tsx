import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui'

/** Building blocks for the Profile screen: a few extra icons, section shells, rows and a switch. */

const EXTRA = {
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      <path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M7 10.5l5 5 5-5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z" />
      <path d="M12 6v13.5" />
    </>
  ),
  code: <path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" />,
  wifiOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M8.5 16.2a5 5 0 0 1 7 0M5 12.7a10 10 0 0 1 4.2-2.4M19 12.7a10 10 0 0 0-2.6-1.8M2 9.3a14.5 14.5 0 0 1 4.6-2.8M22 9.3A14.5 14.5 0 0 0 11 5.6" />
      <path d="M12 19.5v.01" />
    </>
  ),
  wifi: (
    <>
      <path d="M8.5 16.2a5 5 0 0 1 7 0M5 12.7a10 10 0 0 1 14 0M2 9.3a14.5 14.5 0 0 1 20 0" />
      <path d="M12 19.5v.01" />
    </>
  ),
  tractor: (
    <>
      <circle cx="7" cy="16.5" r="3.5" />
      <circle cx="18" cy="17.5" r="2.5" />
      <path d="M4.5 13.5V7h6l2 6.5M10.5 7V4.5M12.5 13.5H20v4M15.5 13.5V9.5h3.5l1 4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" />
    </>
  ),
  cow: (
    <>
      <path d="M6 9.5c-1.8 0-3-1-3.5-2.5 1.5-.3 3 0 3.8.8M18 9.5c1.8 0 3-1 3.5-2.5-1.5-.3-3 0-3.8.8" />
      <path d="M6.5 8.5h11V14a5.5 5.5 0 0 1-11 0z" />
      <path d="M9.5 16.5h5M10 12v.01M14 12v.01" />
    </>
  ),
  shop: (
    <>
      <path d="M4 9.5 5.5 4.5h13L20 9.5" />
      <path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" />
      <path d="M5.5 11.5v8h13v-8M10 19.5v-4.5h4v4.5" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2" />
    </>
  ),
  ruler: (
    <>
      <path d="M3.5 16.5 16.5 3.5l4 4-13 13z" />
      <path d="M8 12l2 2M11 9l2 2M14 6l2 2" />
    </>
  ),
  layers: (
    <>
      <path d="M12 4 3 8.5l9 4.5 9-4.5z" />
      <path d="M3 13l9 4.5 9-4.5M3 17l9 4.5 9-4.5" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />,
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 8.5 4.5 9.5 6-.5.8-1.6 2.3-3.2 3.6M6.4 7.8C4.6 9 3.2 10.8 2.5 12c1 1.5 4.5 6 9.5 6 1.5 0 2.9-.4 4.1-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type PIconName = IconName | keyof typeof EXTRA

/** Arth's icon set plus a few Profile-only glyphs drawn the same way. */
export function PIcon({ name, size = 22, className = '' }: { name: PIconName; size?: number; className?: string }) {
  if (name in EXTRA) {
    return (
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`flex-none ${className}`}
      >
        {EXTRA[name as keyof typeof EXTRA]}
      </svg>
    )
  }
  return <Icon name={name as IconName} size={size} className={className} />
}

type Tint = 'grow' | 'amber' | 'warn' | 'ink' | 'neutral' | 'danger'
const TINT: Record<Tint, string> = {
  grow: 'bg-grow-l text-grow-d',
  amber: 'bg-amber-l text-amber',
  warn: 'bg-warn-l text-warn',
  ink: 'bg-ink text-white',
  neutral: 'bg-chip text-ink-2',
  danger: 'bg-danger-l text-danger',
}

export function IconBubble({ name, tint = 'neutral', size = 'md' }: { name: PIconName; tint?: Tint; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'
  return (
    <span className={`flex flex-none items-center justify-center rounded-2xl ${box} ${TINT[tint]}`}>
      <PIcon name={name} size={size === 'sm' ? 18 : 21} />
    </span>
  )
}

/** A titled group of rows. `id` is the jump target for the section rail. */
export function Section({ id, title, hint, children }: { id: string; title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-16">
      <div className="mx-1 mb-3 mt-8">
        <h2 id={`${id}-h`} className="display text-[23px] leading-tight text-ink">
          {title}
        </h2>
        {hint ? <p className="mt-0.5 text-[14px] leading-snug text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** One tappable settings row — icon, label, current value, chevron. Renders a link when given `href`. */
export function Row({
  icon,
  tint,
  label,
  sub,
  value,
  onClick,
  href,
  external,
  chevron = true,
  tone = 'ink',
}: {
  icon: PIconName
  tint?: Tint
  label: ReactNode
  sub?: ReactNode
  value?: ReactNode
  onClick?: () => void
  href?: string
  external?: boolean
  chevron?: boolean
  tone?: 'ink' | 'danger'
}) {
  const body = (
    <>
      <IconBubble name={icon} tint={tint} />
      <span className="min-w-0 flex-1">
        <span className={`block text-[16px] font-semibold leading-snug ${tone === 'danger' ? 'text-danger' : 'text-ink'}`}>{label}</span>
        {sub ? <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">{sub}</span> : null}
      </span>
      {value ? <span className="flex-none text-right text-[14px] font-semibold text-ink-2">{value}</span> : null}
      {chevron ? <PIcon name="chevron" size={18} className="text-hint" /> : null}
    </>
  )
  const cls = 'flex min-h-[64px] w-full items-center gap-3.5 px-4 py-2.5 text-left transition active:bg-chip/70'
  if (href) {
    return (
      <a href={href} className={cls} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {body}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  )
}

/** Card that stacks rows with hairlines between them. */
export function RowGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-hair overflow-hidden rounded-[26px] bg-card">{children}</div>
}

/** An accessible on/off switch row. */
export function ToggleRow({ icon, tint, label, sub, on, onToggle }: { icon: PIconName; tint?: Tint; label: string; sub?: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle} className="flex min-h-[64px] w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-chip/70">
      <IconBubble name={icon} tint={tint} />
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-snug text-ink">{label}</span>
        {sub ? <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">{sub}</span> : null}
      </span>
      <span aria-hidden className={`relative h-[30px] w-[52px] flex-none rounded-full transition-colors ${on ? 'bg-grow' : 'bg-track'}`}>
        <span className={`absolute top-[3px] h-6 w-6 rounded-full bg-white shadow-sm transition-all ${on ? 'left-[25px]' : 'left-[3px]'}`} />
      </span>
    </button>
  )
}

/** The completion ring in the hero. */
export function Ring({ pct, size = 74 }: { pct: number; size?: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="flex-none -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={7} className="stroke-white/70" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        className="stroke-grow transition-[stroke-dashoffset] duration-700"
      />
    </svg>
  )
}
