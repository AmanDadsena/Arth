import { useEffect, useState, type ReactNode } from 'react'
import { Card, EyebrowLabel, Icon, Skeleton, type IconName } from '@/components/ui'

/**
 * Small pieces shared by the three photo screens (Crop Doctor, Label Reader,
 * Kagaz Samjho). They live with the vision features, not in components/ui.
 */

/** AI results are never kept once the farmer leaves the screen. */
export const AI_MUTATION_OPTIONS = { gcTime: 0, retry: false } as const

/** Friendly "this takes a few seconds" card; the message rotates while waiting. */
export function AiLoading({ messages, hint }: { messages: string[]; hint: string }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (messages.length < 2) return
    const id = setInterval(() => setI((n) => (n + 1) % messages.length), 2400)
    return () => clearInterval(id)
  }, [messages.length])

  return (
    <div role="status" aria-live="polite" className="fade rounded-[26px] bg-card px-5 py-5">
      <div className="flex items-center gap-3.5">
        <span className="relative flex h-12 w-12 flex-none items-center justify-center rounded-full bg-grow-l text-grow">
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-grow/25 border-t-grow motion-reduce:animate-none" />
          <Icon name="sparkle" size={20} />
        </span>
        <div className="min-w-0">
          <div className="text-[17px] font-semibold leading-snug text-ink">{messages[i] ?? messages[0]}</div>
          <div className="mt-0.5 text-[14px] text-muted">{hint}</div>
        </div>
      </div>
      <div aria-hidden className="mt-4 space-y-2.5">
        <Skeleton className="h-5 w-3/4" rounded="rounded-lg" />
        <Skeleton className="h-5 w-full" rounded="rounded-lg" />
        <Skeleton className="h-5 w-2/3" rounded="rounded-lg" />
      </div>
    </div>
  )
}

/** Thumbnail of the photo that was checked (own object URL, released on unmount). */
export function PhotoThumb({ file, alt, className = '' }: { file: File; alt: string; className?: string }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  if (!url) return <div className={`skeleton ${className}`} />
  return <img src={url} alt={alt} className={`object-cover ${className}`} />
}

/** "For a clear answer" tips shown before a photo is picked. */
export function PhotoTips({ title, tips }: { title: string; tips: string[] }) {
  return (
    <Card className="mt-3 px-5 py-4">
      <EyebrowLabel>{title}</EyebrowLabel>
      <ul className="mt-2.5 space-y-2.5">
        {tips.map((tip) => (
          <li key={tip} className="flex items-start gap-3 text-[16px] leading-snug text-ink-2">
            <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-grow-l text-grow">
              <Icon name="check" size={14} strokeWidth={2.6} />
            </span>
            {tip}
          </li>
        ))}
      </ul>
    </Card>
  )
}

type ListTone = 'neutral' | 'grow' | 'danger' | 'amber'
const LIST_DOT: Record<ListTone, string> = {
  neutral: 'bg-chip text-ink-2',
  grow: 'bg-grow-l text-grow',
  danger: 'bg-white/70 text-danger',
  amber: 'bg-amber-l text-amber',
}

/** A titled list of short lines, each with a small round icon. */
export function ListCard({
  title,
  icon = 'chevron',
  items,
  tone = 'neutral',
  className = '',
}: {
  title: ReactNode
  icon?: IconName
  items: string[]
  tone?: ListTone
  className?: string
}) {
  if (!items.length) return null
  const wrap = tone === 'danger' ? 'bg-danger-l' : 'bg-card'
  const text = tone === 'danger' ? 'text-danger' : 'text-ink-2'
  return (
    <section className={`rounded-[26px] px-5 py-4 ${wrap} ${className}`}>
      <div className={`text-[13px] font-semibold uppercase tracking-[1.6px] ${tone === 'danger' ? 'text-danger' : 'text-faint'}`}>{title}</div>
      <ul className="mt-2.5 space-y-3">
        {items.map((item, i) => (
          <li key={i} className={`flex items-start gap-3 text-[16px] leading-snug ${text} ${tone === 'danger' ? 'font-semibold' : ''}`}>
            <span className={`mt-px flex h-7 w-7 flex-none items-center justify-center rounded-full ${LIST_DOT[tone]}`}>
              <Icon name={icon} size={15} strokeWidth={2.4} />
            </span>
            <span className="min-w-0 pt-0.5">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Selectable chip with a full 48 px tap target. */
export function ChoiceChip({ children, selected, onClick, className = '' }: { children: ReactNode; selected: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex h-12 items-center justify-center gap-1.5 rounded-2xl px-4 text-[16px] font-semibold transition ${
        selected ? 'bg-grow text-white' : 'bg-chip text-ink-2 active:brightness-95'
      } ${className}`}
    >
      {selected ? <Icon name="check" size={16} strokeWidth={2.6} /> : null}
      {children}
    </button>
  )
}

/** Confidence → badge tone (≥0.8 sure, ≥0.6 fairly sure, below that not sure). */
export function confidenceLevel(c: number): 'high' | 'medium' | 'low' {
  return c >= 0.8 ? 'high' : c >= 0.6 ? 'medium' : 'low'
}
export const CONFIDENCE_TONE = { high: 'grow', medium: 'amber', low: 'warn' } as const

/** Below this the app never advises on its own — it points to the Kisan Call Centre. */
export const MIN_CONFIDENCE = 0.6

/** Keep the result in view: scroll the screen to the top of the given node. */
export function useScrollIntoViewOn(dep: unknown) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (dep && node) node.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [dep, node])
  return setNode
}
