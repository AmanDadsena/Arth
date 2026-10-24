import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { ActionCard, AiTag, Badge, Button, Card, EscalateCard, EyebrowLabel, ErrorState, Icon, ImagePicker, PageHeader, type PickedImage } from '@/components/ui'
import { api } from '@/lib/api/client'
import { useFarmer } from '@/lib/api/queries'
import type { CropDiagnosis, Lang } from '@/lib/api/types'
import { useLang } from '@/i18n'
import { AiLoading, AI_MUTATION_OPTIONS, ChoiceChip, CONFIDENCE_TONE, confidenceLevel, ListCard, MIN_CONFIDENCE, PhotoThumb, PhotoTips, useScrollIntoViewOn } from './vision'
import { useSpeech } from './useSpeech'

/** Crop Doctor: photo of a sick plant → what it is, how sure, what to do (organic first). */

interface CheckVars {
  file: File
  lang: Lang
  crop?: string
}

const OTHER = 'other'

export default function DoctorPage() {
  const { t } = useTranslation('doctor')
  const { t: tc } = useTranslation('common')
  const { lang } = useLang()
  const nav = useNavigate()
  const farmer = useFarmer()
  const [photo, setPhoto] = useState<PickedImage | null>(null)
  const [crop, setCrop] = useState<string | null>(null)

  const check = useMutation({
    mutationFn: (v: CheckVars) => api.cropDoctor(v.file, v.lang, v.crop),
    ...AI_MUTATION_OPTIONS,
  })
  const scrollRef = useScrollIntoViewOn(check.data)

  function submit() {
    if (!photo) return
    check.mutate({ file: photo.file, lang, crop: crop && crop !== OTHER ? crop : undefined })
  }

  function pick(img: PickedImage | null) {
    setPhoto(img)
    check.reset()
  }

  function scanAnother() {
    check.reset()
    setPhoto(null)
    setCrop(null)
  }

  if (check.data && check.variables) {
    return (
      <div ref={scrollRef} className="fade">
        <PageHeader title={t('title')} back={false} />
        <DiagnosisResult d={check.data} file={check.variables.file} onScanAnother={scanAnother} />
      </div>
    )
  }

  const crops = farmer.data?.crops ?? []
  const pending = check.isPending

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} back={false} />

      <div className="mt-3" inert={pending}>
        <ImagePicker value={photo} onChange={pick} label={t('pickLabel')} hint={t('pickHint')} />
      </div>

      {!photo ? (
        <>
          <PhotoTips title={t('tipsTitle')} tips={[t('tip1'), t('tip2'), t('tip3')]} />
          <div className="mx-1 mb-3 mt-6 text-[13px] font-semibold uppercase tracking-[1.6px] text-faint">{t('moreTools')}</div>
          <div className="space-y-2.5">
            <ActionCard priority="low" icon="label" title={t('toLabel')} detail={t('toLabelDetail')} onClick={() => nav('/label')} />
            <ActionCard priority="low" icon="kagaz" title={t('toKagaz')} detail={t('toKagazDetail')} onClick={() => nav('/kagaz')} />
          </div>
        </>
      ) : (
        <>
          <Card className="mt-3 px-5 py-4" inert={pending}>
            <EyebrowLabel>{t('cropLabel')}</EyebrowLabel>
            <div className="mt-0.5 text-[14px] text-muted">{t('cropOptional')}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {crops.map((c) => (
                <ChoiceChip key={c} selected={crop === c} onClick={() => setCrop(crop === c ? null : c)}>
                  {tc(`crops.${c}`, { defaultValue: c })}
                </ChoiceChip>
              ))}
              <ChoiceChip selected={crop === OTHER} onClick={() => setCrop(crop === OTHER ? null : OTHER)}>
                {t('other')}
              </ChoiceChip>
            </div>
          </Card>

          <div className="mt-4">
            {pending ? (
              <AiLoading messages={[t('loading1'), t('loading2'), t('loading3')]} hint={t('loadingHint')} />
            ) : check.isError ? (
              <ErrorState error={check.error} onRetry={submit} title={t('errorTitle')} />
            ) : (
              <Button icon="sparkle" onClick={submit}>
                {t('check')}
              </Button>
            )}
          </div>
        </>
      )}
    </>
  )
}

const SEVERITY_TONE = { low: 'grow', medium: 'amber', high: 'warn' } as const

function DiagnosisResult({ d, file, onScanAnother }: { d: CropDiagnosis; file: File; onScanAnother: () => void }) {
  const { t } = useTranslation('doctor')
  const { locale } = useLang()
  const speech = useSpeech(locale)
  const [tab, setTab] = useState<'organic' | 'chemical'>('organic')

  const level = confidenceLevel(d.confidence)
  const needsExpert = d.escalate || d.confidence < MIN_CONFIDENCE
  const pct = Math.round(Math.max(0, Math.min(1, d.confidence)) * 100)
  const items = tab === 'organic' ? d.treatment.organic : d.treatment.chemical

  function listen() {
    if (speech.speaking) return speech.stop()
    const parts = [d.diagnosis + '.']
    const organic = d.treatment.organic.slice(0, 2)
    const chemical = d.treatment.chemical.slice(0, 1)
    if (organic.length) parts.push(`${t('speakOrganic')}: ${organic.join('. ')}.`)
    if (chemical.length) parts.push(`${t('speakChemical')}: ${chemical.join('. ')}. ${t('chemicalNote')}`)
    if (needsExpert) parts.push(t('escalateReason'))
    speech.speak(parts.join(' '))
  }

  return (
    <>
      <Card className="mt-3 p-4">
        <div className="flex items-start gap-4">
          <PhotoThumb file={file} alt={t('photoAlt')} className="h-[76px] w-[76px] flex-none rounded-[20px]" />
          <div className="min-w-0 flex-1">
            <EyebrowLabel>{t('mostLikely')}</EyebrowLabel>
            <h2 className="display mt-1 break-words text-[28px] leading-tight text-ink">{d.diagnosis}</h2>
            {d.scientificName ? <div className="mt-0.5 text-[13px] italic text-faint">{d.scientificName}</div> : null}
          </div>
        </div>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Badge tone={CONFIDENCE_TONE[level]} className="px-2.5 py-1.5 text-[13px]">
            {t(`confidence.${level}`)} · <span className="num">{pct}%</span>
          </Badge>
          <Badge tone={SEVERITY_TONE[d.severity]} className="px-2.5 py-1.5 text-[13px]">
            {t('severityLabel')}: {t(`severity.${d.severity}`)}
          </Badge>
        </div>
        {speech.supported ? (
          <Button variant="secondary" size="md" icon={speech.speaking ? 'close' : 'speaker'} className="mt-3.5 bg-chip" onClick={listen}>
            {speech.speaking ? t('stop') : t('listen')}
          </Button>
        ) : null}
      </Card>

      {needsExpert ? (
        <div className="mt-3">
          <EscalateCard reason={t('escalateReason')} />
        </div>
      ) : null}

      <ListCard className="mt-3" title={t('symptoms')} icon="info" items={d.symptoms} />

      <section className="mt-3 rounded-[26px] bg-card px-4 py-4">
        <div className="mx-1 text-[13px] font-semibold uppercase tracking-[1.6px] text-faint">{t('treatment')}</div>
        <div role="tablist" aria-label={t('treatment')} className="mt-3 grid grid-cols-2 gap-1.5 rounded-[22px] bg-chip p-1.5">
          {(['organic', 'chemical'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`tab-${k}`}
              aria-selected={tab === k}
              aria-controls="treatment-panel"
              onClick={() => setTab(k)}
              className={`flex h-12 items-center justify-center gap-2 rounded-[18px] text-[16px] font-semibold transition ${
                tab === k ? 'bg-card text-ink shadow-sm' : 'text-muted'
              }`}
            >
              <Icon name={k === 'organic' ? 'sprout' : 'drop'} size={18} className={tab === k ? (k === 'organic' ? 'text-grow' : 'text-amber') : ''} />
              {t(k)}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="treatment-panel" aria-labelledby={`tab-${tab}`} className="px-1 pt-4">
          {tab === 'organic' ? <div className="mb-2.5 text-[14px] font-semibold text-grow">{t('organicFirst')}</div> : null}
          {items.length ? (
            <ol className="space-y-3">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-[16px] leading-snug text-ink-2">
                  <span
                    className={`num flex h-7 w-7 flex-none items-center justify-center rounded-full text-[13px] font-bold ${
                      tab === 'organic' ? 'bg-grow-l text-grow-d' : 'bg-amber-l text-amber'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 pt-0.5">{item}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[15px] text-muted">{t('noneListed')}</p>
          )}

          {tab === 'chemical' ? (
            <div className="mt-4 rounded-[20px] bg-amber-l px-4 py-3.5">
              <div className="flex items-start gap-2.5 text-[15px] font-semibold leading-snug text-ink">
                <Icon name="alert" size={19} className="mt-0.5 text-amber" />
                {t('chemicalNote')}
              </div>
              <Link
                to="/label"
                className="mt-3 flex h-12 items-center justify-center gap-2 rounded-3xl bg-card text-[16px] font-semibold text-ink active:bg-chip"
              >
                <Icon name="label" size={19} />
                {t('readLabel')}
                <Icon name="chevron" size={16} className="text-faint" />
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <ListCard className="mt-3" title={t('prevention')} icon="shield" tone="grow" items={d.prevention} />

      <div className="mt-5">
        <Button icon="camera" onClick={onScanAnother}>
          {t('scanAnother')}
        </Button>
      </div>

      <AiTag model={d.model} />
    </>
  )
}
