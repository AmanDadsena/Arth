import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, ConfirmDialog, EyebrowLabel, Icon } from '@/components/ui'
import { ApiError } from '@/lib/api/client'
import type { Application, ApplicationStatus } from '@/lib/api/types'
import { OfficialLink } from './SchemeResults'
import { useApplications } from './useApplications'

/**
 * "My applications": every scheme the farmer is tracking, with its status,
 * documents, next step and dates. Nothing is sent to the scheme itself; this is
 * the farmer's own record (stored encrypted on the server).
 */

const STATUSES: ApplicationStatus[] = ['preparing', 'applied', 'approved', 'rejected']
const TONE: Record<ApplicationStatus, 'amber' | 'neutral' | 'grow' | 'danger'> = {
  preparing: 'amber',
  applied: 'neutral',
  approved: 'grow',
  rejected: 'danger',
}
const INPUT =
  'h-[52px] w-full rounded-[18px] bg-chip px-4 text-[17px] font-medium text-ink outline-none placeholder:text-hint focus-visible:ring-2 focus-visible:ring-grow'
const today = () => new Date().toISOString().slice(0, 10)

export function ApplicationsPanel() {
  const { t } = useTranslation('schemes')
  const { list } = useApplications()
  const apps = list.data?.applications ?? []
  if (list.isPending || list.isError || apps.length === 0) return null // the quiz and results stay the focus

  return (
    <section className="mb-5" aria-labelledby="my-apps">
      <div className="mx-1 mb-2 flex items-baseline justify-between">
        <h2 id="my-apps" className="text-[13px] font-semibold uppercase tracking-[1.6px] text-faint">
          {t('tracker.title')}
        </h2>
        <span className="num text-[13px] font-medium text-faint">{t('tracker.count', { count: apps.length })}</span>
      </div>
      <div className="space-y-3">
        {apps.map((a) => (
          <ApplicationCard key={a.schemeId} a={a} />
        ))}
      </div>
    </section>
  )
}

function ApplicationCard({ a }: { a: Application }) {
  const { t } = useTranslation('schemes')
  const { save, remove, inputOf } = useApplications()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [ref, setRef] = useState(a.referenceNo ?? '')
  const [error, setError] = useState<string | null>(null)

  function update(patch: Parameters<typeof inputOf>[1]) {
    setError(null)
    save.mutate(
      { schemeId: a.schemeId, body: inputOf(a, patch) },
      {
        onError: (e) =>
          setError(e instanceof ApiError && e.code === 'reference_is_personal_id' ? t('tracker.refIsId') : t('tracker.failed')),
      },
    )
  }

  const toggleDoc = (i: number) =>
    update({ docsReady: a.docsReady.includes(i) ? a.docsReady.filter((d) => d !== i) : [...a.docsReady, i] })

  return (
    <Card className="px-5 py-4">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 text-left">
        <div className="min-w-0 flex-1">
          <h3 className="display text-[20px] leading-tight text-ink">{a.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge tone={TONE[a.status]}>{t(`tracker.status.${a.status}`)}</Badge>
            <span className="num text-[13px] text-muted">{t('tracker.docs', { done: a.docsReady.length, total: a.documents.length })}</span>
            {a.lastDate && (a.status === 'preparing' || a.status === 'applied') ? (
              <span className="num text-[13px] font-semibold text-warn-m">
                {t('tracker.lastDate')}: {a.lastDate}
              </span>
            ) : null}
          </div>
        </div>
        <Icon name="chevron" size={20} className={`mt-1 text-faint transition ${open ? 'rotate-90' : ''}`} />
      </button>

      <div className="mt-3 rounded-[18px] bg-grow-l px-4 py-3">
        <div className="text-[12px] font-semibold uppercase tracking-[1.2px] text-grow">{t('tracker.next')}</div>
        <div className="mt-0.5 text-[16px] font-semibold leading-snug text-grow-d">{a.nextStep}</div>
      </div>

      {open ? (
        <div className="mt-4 space-y-4">
          <div>
            <EyebrowLabel>{t('tracker.statusLabel')}</EyebrowLabel>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={a.status === s}
                  disabled={save.isPending}
                  onClick={() => update({ status: s, appliedOn: s !== 'preparing' ? (a.appliedOn ?? today()) : a.appliedOn })}
                  className={`min-h-12 rounded-[16px] px-3 text-[15px] font-semibold ${a.status === s ? 'bg-grow text-white' : 'bg-chip text-ink-2'}`}
                >
                  {t(`tracker.status.${s}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <EyebrowLabel>{t('documents')}</EyebrowLabel>
            <ul className="mt-1.5">
              {a.documents.map((d, i) => {
                const on = a.docsReady.includes(i)
                return (
                  <li key={d}>
                    <button type="button" role="checkbox" aria-checked={on} disabled={save.isPending} onClick={() => toggleDoc(i)} className="flex min-h-12 w-full items-center gap-3 text-left">
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

          <label className="block">
            <EyebrowLabel>{t('tracker.lastDate')}</EyebrowLabel>
            <input type="date" className={`${INPUT} mt-2`} value={a.lastDate ?? ''} onChange={(e) => update({ lastDate: e.target.value || null })} />
            <span className="mt-1 block text-[13px] text-faint">{t('tracker.lastDateHint')}</span>
          </label>

          {a.status !== 'preparing' ? (
            <>
              <label className="block">
                <EyebrowLabel>{t('tracker.appliedOn')}</EyebrowLabel>
                <input type="date" className={`${INPUT} mt-2`} value={a.appliedOn ?? ''} onChange={(e) => update({ appliedOn: e.target.value || null })} />
              </label>
              <div>
                <label className="block">
                  <EyebrowLabel>{t('tracker.reference')}</EyebrowLabel>
                  <input
                    className={`${INPUT} mt-2`}
                    value={ref}
                    maxLength={40}
                    autoComplete="off"
                    inputMode="text"
                    onChange={(e) => setRef(e.target.value.replace(/[^A-Za-z0-9/\-_. ]/g, ''))}
                  />
                </label>
                <span className="mt-1 block text-[13px] text-faint">{t('tracker.referenceHint')}</span>
                <Button size="md" variant="secondary" className="mt-2" disabled={save.isPending || ref === (a.referenceNo ?? '')} onClick={() => update({ referenceNo: ref.trim() || null })}>
                  {t('tracker.save')}
                </Button>
              </div>
            </>
          ) : null}

          {error ? (
            <p role="alert" className="text-[14px] font-semibold text-warn-m">
              {error}
            </p>
          ) : null}

          <OfficialLink url={a.officialUrl} />
          <button type="button" onClick={() => setConfirm(true)} className="mx-auto block min-h-11 px-3 text-[14px] font-semibold text-muted underline underline-offset-4">
            {t('tracker.remove')}
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm}
        danger
        busy={remove.isPending}
        title={t('tracker.removeConfirm', { name: a.name })}
        body={t('tracker.removeBody')}
        confirmLabel={t('tracker.remove')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => remove.mutate(a.schemeId, { onSettled: () => setConfirm(false) })}
      />
    </Card>
  )
}

/** On an eligible scheme's card: start tracking it, or show that it is tracked. */
export function TrackButton({ schemeId }: { schemeId: string }) {
  const { t } = useTranslation('schemes')
  const { byId, save, list } = useApplications()
  if (list.isPending) return null
  if (byId(schemeId)) {
    return (
      <div className="flex min-h-12 items-center justify-center gap-2 rounded-3xl bg-grow-l px-5 text-[15px] font-semibold text-grow-d">
        <Icon name="check" size={18} />
        {t('tracker.tracking')}
      </div>
    )
  }
  return (
    <Button size="md" variant="secondary" icon="schemes" disabled={save.isPending} onClick={() => save.mutate({ schemeId, body: { status: 'preparing' } })}>
      {t('tracker.track')}
    </Button>
  )
}

/** After the voice application form: record that the farmer has applied. */
export function MarkAppliedButton({ schemeId }: { schemeId: string }) {
  const { t } = useTranslation('schemes')
  const { byId, save, inputOf } = useApplications()
  const cur = byId(schemeId)
  if (cur && cur.status !== 'preparing') {
    return (
      <div className="flex min-h-12 items-center justify-center gap-2 rounded-3xl bg-grow-l px-5 text-[15px] font-semibold text-grow-d">
        <Icon name="check" size={18} />
        {t('tracker.tracking')}
      </div>
    )
  }
  const body = cur ? inputOf(cur, { status: 'applied', appliedOn: today() }) : { status: 'applied' as const, appliedOn: today() }
  return (
    <Button size="md" icon="check" disabled={save.isPending} onClick={() => save.mutate({ schemeId, body })}>
      {t('tracker.markApplied')}
    </Button>
  )
}
