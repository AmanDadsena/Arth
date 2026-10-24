import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FarmerProfile, FarmerProfileInput } from '@/lib/api/types'
import { toInput, useSaveFarmer } from '@/lib/api/queries'
import { BottomSheet, Button, Chip } from '@/components/ui'
import { BASIC_OPTIONS, MULTI, type BasicField } from './profileData'
import { PIcon } from './parts'

type Draft = number | string | string[] | undefined

function initialDraft(f: FarmerProfile, k: BasicField): Draft {
  if (k === 'experienceYears') return f.experienceYears ?? 5
  const v = f[k]
  return Array.isArray(v) ? [...v] : v
}

/** One question at a time, in the same chip style as onboarding. */
function Question({ f, field, step, total, onDone, onSkip }: { f: FarmerProfile; field: BasicField; step: number; total: number; onDone: () => void; onSkip: () => void }) {
  const { t } = useTranslation('profile')
  const save = useSaveFarmer()
  const [draft, setDraft] = useState<Draft>(() => initialDraft(f, field))
  const multi = MULTI[field]
  const last = step >= total

  function pick(v: string) {
    if (!multi) return setDraft(v)
    const cur = Array.isArray(draft) ? draft : []
    // "no animals" excludes the rest, and picking an animal clears "no animals"
    if (field === 'livestock' && v === 'none') return setDraft(cur.includes('none') ? [] : ['none'])
    const base = field === 'livestock' ? cur.filter((x) => x !== 'none') : cur
    setDraft(base.includes(v) ? base.filter((x) => x !== v) : [...base, v])
  }

  const empty = draft === undefined || (Array.isArray(draft) && draft.length === 0)

  async function commit() {
    const input: FarmerProfileInput = { ...toInput(f), [field]: draft }
    try {
      await save.mutateAsync(input)
      onDone()
    } catch {
      /* error shown below */
    }
  }

  return (
    <div>
      {total > 1 ? <div className="num mb-1 text-[13px] font-semibold text-faint">{t('sheet.stepOf', { n: step, total })}</div> : null}
      <p className="text-[14px] leading-snug text-muted">{t(multi ? 'q.pickMany' : field === 'experienceYears' ? 'q.why' : 'q.pickOne')}</p>

      {field === 'experienceYears' ? (
        <div className="mt-5 flex items-center justify-center gap-5">
          <button
            type="button"
            aria-label={t('sheet.less')}
            onClick={() => setDraft(Math.max(0, Number(draft ?? 0) - 1))}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-card text-[28px] font-semibold text-ink active:bg-chip"
          >
            −
          </button>
          <div className="min-w-[110px] text-center" aria-live="polite">
            <div className="display num text-[56px] leading-none text-ink">{Number(draft ?? 0)}</div>
            <div className="mt-1 text-[14px] font-medium text-faint">{t('sheet.years')}</div>
          </div>
          <button
            type="button"
            aria-label={t('sheet.more')}
            onClick={() => setDraft(Math.min(80, Number(draft ?? 0) + 1))}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-card text-[28px] font-semibold text-ink active:bg-chip"
          >
            +
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2" role={multi ? 'group' : 'radiogroup'}>
          {BASIC_OPTIONS[field].map((v) => {
            const on = Array.isArray(draft) ? draft.includes(v) : draft === v
            return (
              <Chip key={v} selected={on} onClick={() => pick(v)} className="min-h-12">
                {on ? <PIcon name="check" size={16} className="-ml-1 mr-1 inline-block align-[-2px]" /> : null}
                {t(`${field === 'landOwnership' ? 'ownership' : field}.${v}`)}
              </Chip>
            )
          })}
        </div>
      )}

      {field === 'experienceYears' ? null : <p className="mt-4 text-[13px] leading-snug text-faint">{t('q.why')}</p>}
      {save.isError ? (
        <p role="alert" className="mt-3 text-[14px] font-semibold text-danger">
          {t('sheet.saveFailed')}
        </p>
      ) : null}

      <div className="mt-5 space-y-2.5">
        <Button loading={save.isPending} disabled={empty} onClick={() => void commit()}>
          {last ? t('sheet.save') : t('sheet.saveNext')}
        </Button>
        <Button variant="secondary" disabled={save.isPending} onClick={onSkip}>
          {t('sheet.skip')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Asks the optional basics right here on Profile. `queue` is one field when a
 * tile was tapped, or every missing field for "Finish my profile".
 */
export function BasicsSheet({ f, queue, onClose }: { f: FarmerProfile; queue: BasicField[]; onClose: () => void }) {
  const { t } = useTranslation('profile')
  const [i, setI] = useState(0)
  const field = queue[i]
  if (!field) return null
  const next = () => (i + 1 < queue.length ? setI(i + 1) : onClose())
  return (
    <BottomSheet open onClose={onClose} title={t(`q.${field}`)}>
      <Question key={field} f={f} field={field} step={i + 1} total={queue.length} onDone={next} onSkip={next} />
    </BottomSheet>
  )
}
