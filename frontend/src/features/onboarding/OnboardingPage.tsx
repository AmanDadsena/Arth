import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, SkeletonScreen } from '@/components/ui'
import { useFarmer, useSaveFarmer } from '@/lib/api/queries'
import type { FarmerProfile } from '@/lib/api/types'
import { useLang } from '@/i18n'
import { useAuth } from '@/features/auth/useAuth'
import { getLocalConsent } from '@/features/auth/AuthProvider'
import { QUESTIONS, REVIEW, firstMissing, initialDraft, isAnswered, toProfileInput, type Draft, type QuestionId } from './model'
import { ProgressHeader, StepTransition } from './parts'
import { QuestionBody } from './Questions'
import { Review } from './Review'

/**
 * The basic questions asked right after sign-in (and consent): one question
 * per screen, then a summary where any row can be changed, then PUT /farmer/me.
 * `?edit=1` opens the same flow from Profile, prefilled, starting at the
 * summary, and returns to Profile when saved.
 */

export default function OnboardingPage() {
  const [params] = useSearchParams()
  const editing = params.get('edit') === '1'
  const farmer = useFarmer()

  // editing needs the saved profile before the draft is built from it
  if (editing && farmer.isPending) {
    return (
      <div className="px-5 pt-[max(24px,env(safe-area-inset-top))]">
        <SkeletonScreen cards={4} />
      </div>
    )
  }
  return <Flow editing={editing} existing={farmer.data} />
}

const AUTO_ADVANCE_MS = 320

function Flow({ editing, existing }: { editing: boolean; existing: FarmerProfile | undefined }) {
  const { t } = useTranslation('onboarding')
  const { t: tc } = useTranslation('common')
  const nav = useNavigate()
  const { displayName } = useAuth()
  const { lang } = useLang()
  const save = useSaveFarmer()

  const [draft, setDraft] = useState<Draft>(() => initialDraft(existing, displayName))
  const [step, setStep] = useState(editing ? REVIEW : 0)
  const [dir, setDir] = useState<1 | -1>(1)
  /** opened from a summary row: Next / Back return to the summary */
  const [fromReview, setFromReview] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const set = (patch: Partial<Draft>) => setDraft((cur) => ({ ...cur, ...patch }))

  function go(to: number, d: 1 | -1) {
    window.clearTimeout(timer.current)
    setDir(d)
    setStep(to)
  }

  function next() {
    if (fromReview || step === REVIEW - 1) {
      setFromReview(false)
      return go(REVIEW, 1)
    }
    go(step + 1, 1)
  }

  function back() {
    if (step === REVIEW) {
      if (editing) return nav('/profile', { replace: true })
      return go(REVIEW - 1, -1)
    }
    if (fromReview) {
      setFromReview(false)
      return go(REVIEW, -1)
    }
    if (step === 0) return nav(editing ? '/profile' : '/consent', { replace: true })
    go(step - 1, -1)
  }

  /** answer a single-choice question and move on once the tick has been seen */
  function pick(patch: Partial<Draft>) {
    set(patch)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(next, AUTO_ADVANCE_MS)
  }

  function jump(id: QuestionId) {
    setFromReview(true)
    go(
      QUESTIONS.findIndex((q) => q.id === id),
      1,
    )
  }

  async function finish() {
    const missing = firstMissing(draft)
    if (missing >= 0) {
      setFromReview(true)
      return go(missing, 1)
    }
    setFailed(false)
    try {
      await save.mutateAsync(toProfileInput(draft, lang, existing?.consentAt ?? getLocalConsent() ?? new Date().toISOString(), existing))
      nav(editing ? '/profile' : '/', { replace: true })
    } catch {
      setFailed(true)
    }
  }

  const total = QUESTIONS.length
  const q = step < REVIEW ? QUESTIONS[step]! : null
  const answered = q ? isAnswered(q.id, draft) : true
  const missing = firstMissing(draft)

  return (
    <div className="flex min-h-full flex-col px-5 pt-[max(16px,env(safe-area-inset-top))]">
      <ProgressHeader n={q ? step + 1 : total} total={total} onBack={back} />

      <StepTransition stepKey={step} dir={dir}>
        <div className="flex-1 pb-6">
          {q ? <QuestionBody key={q.id} q={q} draft={draft} set={set} pick={pick} onSubmit={() => answered && next()} /> : <Review draft={draft} onJump={jump} editing={editing} />}
        </div>
      </StepTransition>

      <div className="sticky bottom-0 -mx-5 bg-linear-to-t from-screen from-75% to-transparent px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-6">
        {q ? (
          q.optional && !answered ? (
            // nothing chosen yet on an optional question: the one way on is "Skip"
            <Button variant="secondary" onClick={next}>
              {t('skip')}
            </Button>
          ) : (
            <Button disabled={!answered} onClick={next} icon={fromReview ? 'check' : undefined}>
              {fromReview ? t('toReview') : tc('next')}
            </Button>
          )
        ) : (
          <>
            {failed ? (
              <p role="alert" className="mb-2 text-center text-[14px] font-semibold text-warn-d">
                {t('saveFailed')}
              </p>
            ) : missing >= 0 ? (
              <p className="mb-2 text-center text-[14px] font-semibold text-warn-d">{t('review.fixFirst')}</p>
            ) : null}
            <Button loading={save.isPending} onClick={() => void finish()} icon="check">
              {editing ? t('review.save') : t('finish')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
