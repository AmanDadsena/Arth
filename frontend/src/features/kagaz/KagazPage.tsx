import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { AiTag, Button, Card, Chip, EscalateCard, EyebrowLabel, ErrorState, Icon, ImagePicker, PageHeader, type PickedImage } from '@/components/ui'
import { api } from '@/lib/api/client'
import type { DocumentExplanation, Lang } from '@/lib/api/types'
import { fmtDate, useLang } from '@/i18n'
import { AiLoading, AI_MUTATION_OPTIONS, ListCard, PhotoTips, useScrollIntoViewOn } from '@/features/doctor/vision'

/**
 * Kagaz Samjho: photo of a paper (bank notice, 7/12, insurance letter) →
 * what it says in plain words, the dates that matter and what to do next.
 * Private numbers are hidden on the server before the model reads the page.
 */

interface ExplainVars {
  file: File
  lang: Lang
}

export default function KagazPage() {
  const { t } = useTranslation('kagaz')
  const { lang } = useLang()
  const [photo, setPhoto] = useState<PickedImage | null>(null)

  const explain = useMutation({
    mutationFn: (v: ExplainVars) => api.explainDocument(v.file, v.lang),
    ...AI_MUTATION_OPTIONS,
  })
  const scrollRef = useScrollIntoViewOn(explain.data)

  function submit() {
    if (!photo) return
    explain.mutate({ file: photo.file, lang })
  }

  function pick(img: PickedImage | null) {
    setPhoto(img)
    explain.reset()
  }

  function explainAnother() {
    explain.reset()
    setPhoto(null)
  }

  if (explain.data) {
    return (
      <div ref={scrollRef} className="fade">
        <PageHeader title={t('title')} />
        <PrivacyLine />
        <DocumentResult d={explain.data} onAnother={explainAnother} />
      </div>
    )
  }

  const pending = explain.isPending

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <PrivacyLine />

      <div className="mt-3" inert={pending}>
        <ImagePicker value={photo} onChange={pick} label={t('pickLabel')} hint={t('pickHint')} />
      </div>

      {!photo ? (
        <PhotoTips title={t('tipsTitle')} tips={[t('tip1'), t('tip2'), t('tip3')]} />
      ) : (
        <div className="mt-4">
          {pending ? (
            <AiLoading messages={[t('loading1'), t('loading2'), t('loading3')]} hint={t('loadingHint')} />
          ) : explain.isError ? (
            <ErrorState error={explain.error} onRetry={submit} title={t('errorTitle')} />
          ) : (
            <Button icon="kagaz" onClick={submit}>
              {t('explain')}
            </Button>
          )}
        </div>
      )}
    </>
  )
}

function PrivacyLine() {
  const { t } = useTranslation('kagaz')
  return (
    <div className="mt-2 flex items-start gap-3 rounded-[22px] bg-grow-l px-4 py-3 text-[14px] leading-snug text-grow-d">
      <Icon name="lock" size={18} className="mt-px" />
      <span>{t('privacy')}</span>
    </div>
  )
}

const DAY_MS = 86_400_000

function daysUntil(isoDate: string) {
  const d = new Date(isoDate.length === 10 ? isoDate + 'T00:00:00' : isoDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / DAY_MS)
}

function DeadlineCard({ label, date }: { label: string; date: string }) {
  const { t } = useTranslation('kagaz')
  const { lang } = useLang()
  const left = daysUntil(date)
  const urgent = left <= 7
  const valid = Number.isFinite(left)
  const when = !valid ? '' : left < 0 ? t('passed') : left === 0 ? t('today') : left === 1 ? t('tomorrow') : t('daysLeft', { n: left })
  return (
    <div className={`flex items-center gap-4 rounded-[24px] px-4 py-3.5 ${urgent ? 'bg-warn-l' : 'bg-amber-l'}`}>
      <div className={`flex h-[64px] w-[64px] flex-none flex-col items-center justify-center rounded-[18px] bg-card ${urgent ? 'text-warn-d' : 'text-amber'}`}>
        {valid ? (
          <>
            <span className="num text-[24px] font-bold leading-none">{fmtDate(date, lang, { day: 'numeric' })}</span>
            <span className="mt-1 text-[12px] font-semibold uppercase">{fmtDate(date, lang, { month: 'short' })}</span>
          </>
        ) : (
          <Icon name="calendar" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-[16px] font-semibold leading-snug ${urgent ? 'text-warn-d' : 'text-ink'}`}>{label}</div>
        {valid ? (
          <div className={`mt-1 inline-flex items-center gap-1.5 text-[14px] font-semibold ${urgent ? 'text-warn-m' : 'text-amber'}`}>
            <Icon name="calendar" size={15} />
            <span className="num">{when}</span>
            <span className="font-medium opacity-80">· {fmtDate(date, lang, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
        ) : (
          <div className="mt-1 text-[14px] text-muted">{date}</div>
        )}
      </div>
    </div>
  )
}

function NextSteps({ steps }: { steps: string[] }) {
  const { t } = useTranslation('kagaz')
  const [done, setDone] = useState<Set<number>>(() => new Set())
  if (!steps.length) return null

  function toggle(i: number) {
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <Card className="mt-3 px-3 py-4">
      <div className="mx-2 flex items-baseline justify-between gap-2">
        <EyebrowLabel>{t('nextSteps')}</EyebrowLabel>
        <span className="num text-[13px] font-semibold text-faint">{t('stepsDone', { done: done.size, total: steps.length })}</span>
      </div>
      <ul className="mt-2 space-y-1">
        {steps.map((s, i) => {
          const on = done.has(i)
          return (
            <li key={i}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(i)}
                className="flex min-h-14 w-full items-center gap-3.5 rounded-[18px] px-2 py-2 text-left active:bg-chip"
              >
                <span
                  className={`flex h-8 w-8 flex-none items-center justify-center rounded-[10px] border-2 transition ${
                    on ? 'border-grow bg-grow text-white' : 'border-track bg-card text-transparent'
                  }`}
                >
                  <Icon name="check" size={18} strokeWidth={2.8} />
                </span>
                <span className={`text-[16px] leading-snug ${on ? 'text-faint line-through' : 'text-ink'}`}>{s}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function DocumentResult({ d, onAnother }: { d: DocumentExplanation; onAnother: () => void }) {
  const { t } = useTranslation('kagaz')
  const unreadable = !d.summary.trim() && !d.keyPoints.length && !d.nextSteps.length
  const deadlines = [...d.deadlines].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <>
      {d.redactedFields.length ? (
        <div className="mt-3">
          <div className="mx-1 text-[13px] font-semibold text-grow-d">{t('hiddenTitle')}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {d.redactedFields.map((f) => (
              <Chip key={f} tone="grow">
                <Icon name="lock" size={14} />
                {f}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {unreadable ? (
        <div className="mt-3 space-y-3">
          <Card className="px-5 py-5">
            <div className="flex items-center gap-2.5 text-[18px] font-semibold text-ink">
              <Icon name="alert" className="text-warn" />
              {t('unclearTitle')}
            </div>
            <p className="mt-1.5 text-[15px] leading-snug text-muted">{t('unclearBody')}</p>
          </Card>
          <EscalateCard reason={t('helpReason')} />
        </div>
      ) : (
        <>
          <Card className="mt-3 px-5 py-5">
            <EyebrowLabel>{d.docType}</EyebrowLabel>
            <p className="mt-2.5 text-[19px] font-medium leading-relaxed text-ink">{d.summary}</p>
          </Card>

          {deadlines.length ? (
            <section className="mt-3">
              <div className="mx-1 mb-2 text-[13px] font-semibold uppercase tracking-[1.6px] text-faint">{t('deadlines')}</div>
              <div className="space-y-2">
                {deadlines.map((dl) => (
                  <DeadlineCard key={dl.label + dl.date} label={dl.label} date={dl.date} />
                ))}
              </div>
            </section>
          ) : null}

          <ListCard className="mt-3" title={t('keyPoints')} icon="info" items={d.keyPoints} />
          <NextSteps steps={d.nextSteps} />

          <div className="mt-3">
            <EscalateCard reason={t('helpReason')} />
          </div>
        </>
      )}

      <div className="mt-5">
        <Button icon="camera" onClick={onAnother}>
          {t('another')}
        </Button>
      </div>

      <AiTag model={d.model} />
    </>
  )
}
