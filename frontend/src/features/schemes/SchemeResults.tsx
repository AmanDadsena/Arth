import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, EscalateCard, EyebrowLabel, Icon } from '@/components/ui'
import type { SchemeResult } from '@/lib/api/types'

/** Eligible schemes first (green check + reasons), the rest collapsed below. */

export function OfficialLink({ url, className = '' }: { url: string; className?: string }) {
  const { t } = useTranslation('schemes')
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex min-h-12 items-center justify-center gap-2 rounded-3xl bg-chip px-5 text-[16px] font-semibold text-ink active:brightness-95 ${className}`}
    >
      <Icon name="globe" size={19} />
      {t('official')}
      <span aria-hidden className="text-faint">
        ↗
      </span>
    </a>
  )
}

/** Tick off documents as the farmer gathers them (kept on screen only). */
export function DocChecklist({ docs }: { docs: string[] }) {
  const { t } = useTranslation('schemes')
  const [have, setHave] = useState<Set<string>>(() => new Set())
  if (!docs.length) return null
  const toggle = (d: string) =>
    setHave((cur) => {
      const next = new Set(cur)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-2">
        <EyebrowLabel>{t('documents')}</EyebrowLabel>
        <span className="num text-[13px] font-medium text-faint">{t('docsProgress', { done: have.size, total: docs.length })}</span>
      </div>
      <ul className="mt-1.5">
        {docs.map((d) => {
          const on = have.has(d)
          return (
            <li key={d}>
              <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(d)} className="flex min-h-12 w-full items-center gap-3 text-left">
                <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg border-2 ${on ? 'border-grow bg-grow text-white' : 'border-track bg-card text-transparent'}`}>
                  <Icon name="check" size={16} strokeWidth={2.5} />
                </span>
                <span className={`text-[16px] leading-snug ${on ? 'text-muted line-through' : 'text-ink'}`}>{d}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function EligibleCard({ s, onApply }: { s: SchemeResult; onApply: () => void }) {
  const { t } = useTranslation('schemes')
  return (
    <Card className="px-5 py-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-grow text-white">
          <Icon name="check" size={22} strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="display text-[21px] leading-tight text-ink">{s.name}</h3>
          <Badge tone="grow" className="mt-1.5">
            {t('canApply')}
          </Badge>
        </div>
      </div>

      <div className="mt-4 rounded-[20px] bg-grow-l px-4 py-3">
        <div className="text-[12px] font-semibold uppercase tracking-[1.2px] text-grow">{t('benefit')}</div>
        <div className="mt-0.5 text-[17px] font-semibold leading-snug text-grow-d">{s.benefit}</div>
      </div>

      {s.reasons.length ? (
        <div className="mt-4">
          <EyebrowLabel>{t('whyYes')}</EyebrowLabel>
          <ul className="mt-1.5 space-y-1.5">
            {s.reasons.map((r) => (
              <li key={r} className="flex items-start gap-2 text-[15px] leading-snug text-ink-2">
                <Icon name="check" size={16} className="mt-0.5 text-grow" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <DocChecklist docs={s.documents} />

      <div className="mt-4 space-y-2.5">
        <Button icon="mic" size="md" onClick={onApply}>
          {t('apply')}
        </Button>
        <OfficialLink url={s.officialUrl} />
      </div>
    </Card>
  )
}

function NotEligibleCard({ s }: { s: SchemeResult }) {
  const { t } = useTranslation('schemes')
  return (
    <Card className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[17px] font-semibold leading-snug text-ink-2">{s.name}</h3>
        <Badge tone="neutral" className="flex-none">
          {t('notEligibleTag')}
        </Badge>
      </div>
      <p className="mt-1 text-[14px] leading-snug text-muted">{s.benefit}</p>
      {s.reasons.length ? (
        <div className="mt-3">
          <EyebrowLabel>{t('whyNo')}</EyebrowLabel>
          <ul className="mt-1 space-y-1">
            {s.reasons.map((r) => (
              <li key={r} className="flex items-start gap-2 text-[15px] leading-snug text-ink-2">
                <Icon name="info" size={16} className="mt-0.5 text-faint" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <OfficialLink url={s.officialUrl} className="mt-3" />
    </Card>
  )
}

export function SchemeResults({
  schemes,
  onApply,
  onChangeAnswers,
  onStartOver,
}: {
  schemes: SchemeResult[]
  onApply: (s: SchemeResult) => void
  onChangeAnswers: () => void
  onStartOver: () => void
}) {
  const { t } = useTranslation('schemes')
  const [showOthers, setShowOthers] = useState(false)
  const yes = schemes.filter((s) => s.eligible)
  const no = schemes.filter((s) => !s.eligible)

  const actions = (
    <div className="mt-5 grid grid-cols-2 gap-2.5">
      <Button variant="secondary" size="md" icon="edit" onClick={onChangeAnswers}>
        {t('changeAnswers')}
      </Button>
      <Button variant="secondary" size="md" icon="retry" onClick={onStartOver}>
        {t('startOver')}
      </Button>
    </div>
  )

  if (schemes.length === 0) {
    return (
      <div className="mt-4 space-y-3">
        <EmptyState icon="schemes" title={t('emptyTitle')} body={t('emptyBody')} />
        {actions}
        <EscalateCard reason={t('escalateReason')} />
      </div>
    )
  }

  return (
    <>
      {yes.length ? (
        <div className="mt-4 rounded-[26px] bg-grow px-5 py-4 text-white">
          <div className="display text-[24px] leading-tight">{t('eligibleCount', { count: yes.length })}</div>
          <p className="mt-1 text-[14px] leading-snug text-white/80">{t('note')}</p>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState icon="schemes" title={t('noneEligibleTitle')} body={t('noneEligibleBody')} />
        </div>
      )}

      {yes.length ? (
        <div className="mt-4 space-y-3">
          {yes.map((s) => (
            <EligibleCard key={s.id} s={s} onApply={() => onApply(s)} />
          ))}
        </div>
      ) : null}

      {no.length ? (
        <>
          <button
            type="button"
            aria-expanded={showOthers}
            onClick={() => setShowOthers((v) => !v)}
            className="mt-5 flex min-h-14 w-full items-center justify-between rounded-[22px] bg-card px-5 text-left text-[16px] font-semibold text-ink-2"
          >
            {t('notEligible', { count: no.length })}
            <Icon name="chevron" size={18} className={`text-faint transition ${showOthers ? 'rotate-90' : ''}`} />
          </button>
          {showOthers ? (
            <div className="mt-2.5 space-y-2.5">
              {no.map((s) => (
                <NotEligibleCard key={s.id} s={s} />
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {actions}

      <div className="mt-6">
        <EscalateCard reason={t('escalateReason')} />
      </div>
    </>
  )
}
