import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ErrorState, IconButton, Skeleton } from '@/components/ui'
import { api } from '@/lib/api/client'
import { useFarmer } from '@/lib/api/queries'
import type { SchemeAnswers, SchemeMatch, SchemeResult } from '@/lib/api/types'
import { useLang } from '@/i18n'
import { ApplyForm } from './ApplyForm'
import { QUESTIONS, SchemeQuiz, type Draft } from './SchemeQuiz'
import { SchemeResults } from './SchemeResults'

/**
 * Scheme finder: a short conversation (one question per screen), then
 * POST /schemes/match, then the results — and, for an eligible scheme, an
 * application form that can be filled by voice. Sub-views are local state.
 */

type Phase = 'quiz' | 'results' | 'apply'

function Header({ title, subtitle, onBack, backLabel }: { title: ReactNode; subtitle?: ReactNode; onBack: () => void; backLabel: string }) {
  return (
    <header className="flex items-start gap-3 pb-2">
      <IconButton icon="back" label={backLabel} onClick={onBack} />
      <div className="min-w-0 flex-1 pt-0.5">
        <h1 className="display text-[30px] leading-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[15px] text-muted">{subtitle}</p> : null}
      </div>
    </header>
  )
}

export default function SchemesPage() {
  const { t } = useTranslation('schemes')
  const nav = useNavigate()
  const { lang } = useLang()
  const farmer = useFarmer().data

  const [phase, setPhase] = useState<Phase>('quiz')
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>({})
  const [submitted, setSubmitted] = useState<SchemeAnswers | null>(null)
  const [applyFor, setApplyFor] = useState<SchemeResult | null>(null)
  const top = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // the app shell scrolls <main>, not the window
    top.current?.closest('main')?.scrollTo({ top: 0 })
  }, [phase, step])

  const match = useQuery<SchemeMatch, Error>({
    queryKey: ['schemes', 'match', submitted, lang],
    queryFn: () => api.matchSchemes(submitted!, lang),
    enabled: submitted !== null,
    staleTime: Infinity,
  })

  function leave() {
    if (window.history.length > 1) nav(-1)
    else nav('/')
  }

  function answer(patch: Draft) {
    const next = { ...draft, ...patch }
    setDraft(next)
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1)
      return
    }
    setSubmitted({
      ownsLand: next.ownsLand ?? false,
      landAcres: next.landAcres ?? farmer?.landAcres ?? 0,
      category: next.category ?? 'general',
      hasBankAccount: next.hasBankAccount ?? false,
      hasAadhaar: next.hasAadhaar ?? false,
      isWoman: next.isWoman ?? false,
      irrigation: next.irrigation ?? farmer?.irrigation ?? 'rainfed',
      incomeTaxPayer: next.incomeTaxPayer ?? false,
    })
    setPhase('results')
  }

  function restart(keepAnswers: boolean) {
    if (!keepAnswers) setDraft({})
    setStep(0)
    setPhase('quiz')
  }

  let body: ReactNode
  if (phase === 'apply' && applyFor) {
    body = <ApplyForm key={applyFor.id} scheme={applyFor} farmer={farmer} onBack={() => setPhase('results')} />
  } else if (phase === 'results') {
    body = (
      <>
        <Header title={t('resultsTitle')} onBack={() => restart(true)} backLabel={t('changeAnswers')} />
        {match.isPending ? (
          <div role="status" aria-label={t('finding')} className="mt-4 space-y-3">
            <p className="px-1 text-[16px] font-medium text-muted">{t('finding')}</p>
            <Skeleton className="h-24 w-full" rounded="rounded-[26px]" />
            <Skeleton className="h-72 w-full" rounded="rounded-[28px]" />
            <Skeleton className="h-72 w-full" rounded="rounded-[28px]" />
          </div>
        ) : match.isError ? (
          <div className="mt-4">
            <ErrorState error={match.error} onRetry={() => void match.refetch()} />
          </div>
        ) : (
          <SchemeResults
            schemes={match.data.schemes}
            onApply={(s) => {
              setApplyFor(s)
              setPhase('apply')
            }}
            onChangeAnswers={() => restart(true)}
            onStartOver={() => restart(false)}
          />
        )}
      </>
    )
  } else {
    body = (
      <>
        <div className="mb-4 flex items-center justify-between px-1">
          <span className="text-[13px] font-semibold uppercase tracking-[1.6px] text-faint">{t('title')}</span>
        </div>
        <SchemeQuiz
          key={step}
          step={step}
          draft={draft}
          profile={{ landAcres: farmer?.landAcres, irrigation: farmer?.irrigation }}
          onAnswer={answer}
          onBack={() => (step === 0 ? leave() : setStep(step - 1))}
        />
        {step === 0 ? <p className="mt-8 px-1 text-[14px] leading-snug text-faint">{t('subtitle')}</p> : null}
      </>
    )
  }

  return (
    <div ref={top}>
      {body}
    </div>
  )
}
