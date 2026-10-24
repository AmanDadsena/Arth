import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { AiTag, BigValue, Button, Card, Chip, EscalateCard, EyebrowLabel, ErrorState, Icon, ImagePicker, PageHeader, type PickedImage } from '@/components/ui'
import { api } from '@/lib/api/client'
import { useFarmer } from '@/lib/api/queries'
import type { Lang, LabelReading } from '@/lib/api/types'
import { useLang } from '@/i18n'
import { AiLoading, AI_MUTATION_OPTIONS, ListCard, MIN_CONFIDENCE, PhotoTips, useScrollIntoViewOn } from '@/features/doctor/vision'

/**
 * Label Reader: photo of a pesticide label → the dose for the farmer's own tank.
 * The dose is only ever what the label prints (scaled to the tank by the server).
 * No readable dose, or a doubtful read → no number at all, Kisan Call Centre instead.
 */

const TANK_PRESETS = [10, 12, 15, 16, 20]
const TANK_MIN = 5
const TANK_MAX = 30

interface ReadVars {
  file: File
  lang: Lang
  tank: number
}

export default function LabelPage() {
  const { t } = useTranslation('label')
  const { lang } = useLang()
  const farmer = useFarmer()
  const [photo, setPhoto] = useState<PickedImage | null>(null)
  const [tankPick, setTankPick] = useState<number | null>(null)

  const profileTank = farmer.data?.tankSizeLitres
  const tank = tankPick ?? profileTank ?? 15

  const read = useMutation({
    mutationFn: (v: ReadVars) => api.labelReader(v.file, v.lang, v.tank),
    ...AI_MUTATION_OPTIONS,
  })
  const scrollRef = useScrollIntoViewOn(read.data)

  function submit() {
    if (!photo) return
    read.mutate({ file: photo.file, lang, tank })
  }

  function pick(img: PickedImage | null) {
    setPhoto(img)
    read.reset()
  }

  function setTank(n: number) {
    setTankPick(Math.max(TANK_MIN, Math.min(TANK_MAX, Math.round(n))))
    read.reset()
  }

  function readAnother() {
    read.reset()
    setPhoto(null)
  }

  if (read.data) {
    return (
      <div ref={scrollRef} className="fade">
        <PageHeader title={t('title')} />
        <LabelResult r={read.data} onReadAnother={readAnother} />
      </div>
    )
  }

  const pending = read.isPending

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <Card className="mt-3 px-5 py-4" inert={pending}>
        <div className="flex items-baseline justify-between gap-2">
          <EyebrowLabel>{t('tank')}</EyebrowLabel>
          {profileTank && tank === profileTank ? <span className="text-[13px] font-medium text-faint">{t('fromProfile')}</span> : null}
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {TANK_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={tank === n}
              onClick={() => setTank(n)}
              className={`num h-12 rounded-2xl text-[17px] font-semibold transition ${tank === n ? 'bg-grow text-white' : 'bg-chip text-ink-2 active:brightness-95'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            aria-label={t('smaller')}
            disabled={tank <= TANK_MIN}
            onClick={() => setTank(tank - 1)}
            className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-chip text-[26px] font-semibold text-ink disabled:text-hint"
          >
            −
          </button>
          <div className="flex-1 text-center" aria-live="polite">
            <span className="num text-[30px] font-semibold text-ink">{tank}</span>
            <span className="ml-1.5 text-[16px] text-muted">{t('litreTank')}</span>
          </div>
          <button
            type="button"
            aria-label={t('bigger')}
            disabled={tank >= TANK_MAX}
            onClick={() => setTank(tank + 1)}
            className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-chip text-[26px] font-semibold text-ink disabled:text-hint"
          >
            +
          </button>
        </div>
      </Card>

      <div className="mt-3" inert={pending}>
        <ImagePicker value={photo} onChange={pick} label={t('pickLabel')} hint={t('pickHint')} />
      </div>

      {!photo ? (
        <PhotoTips title={t('tipsTitle')} tips={[t('tip1'), t('tip2'), t('tip3')]} />
      ) : (
        <div className="mt-4">
          {pending ? (
            <AiLoading messages={[t('loading1'), t('loading2'), t('loading3', { n: tank })]} hint={t('loadingHint')} />
          ) : read.isError ? (
            <ErrorState error={read.error} onRetry={submit} title={t('errorTitle')} />
          ) : (
            <Button icon="label" onClick={submit}>
              {t('read')}
            </Button>
          )}
        </div>
      )}
    </>
  )
}

function fmtAmount(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 1 })
}

function LabelResult({ r, onReadAnother }: { r: LabelReading; onReadAnother: () => void }) {
  const { t } = useTranslation('label')
  const { t: tc } = useTranslation('common')

  const doubtful = r.confidence < MIN_CONFIDENCE
  // a dose is shown only when the label printed one AND the read is trustworthy
  const dose = r.dosePerTank && !doubtful ? r.dosePerTank : null
  const escalateReason = !r.dosePerTank ? (
    <>
      <strong className="block text-white">{t('noDose')}</strong>
      {t('noDoseReason')}
    </>
  ) : doubtful ? (
    <>
      <strong className="block text-white">{t('unclearTitle')}</strong>
      {t('unclearReason')}
    </>
  ) : r.escalate ? (
    t('checkReason')
  ) : null

  return (
    <>
      <Card className="mt-3 px-5 py-4">
        <EyebrowLabel>{t('product')}</EyebrowLabel>
        <h2 className="display mt-1 break-words text-[26px] leading-tight text-ink">{r.productName}</h2>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {r.activeIngredient ? <Chip>{r.activeIngredient}</Chip> : null}
          {r.formulation ? <Chip tone="amber">{r.formulation}</Chip> : null}
        </div>
      </Card>

      {dose ? (
        <section className="mt-3 rounded-[28px] bg-grow-l px-5 py-5" aria-labelledby="dose-title">
          <div id="dose-title" className="text-[13px] font-semibold uppercase tracking-[1.6px] text-grow-d">
            {t('dose')}
          </div>
          <div className="mt-2.5">
            <BigValue
              size={72}
              tone="grow"
              value={
                <>
                  {fmtAmount(dose.amount)}
                  <span className="ml-2 text-[34px]">{t(`unit.${dose.unit}`)}</span>
                </>
              }
            />
          </div>
          <div className="mt-3 flex items-center gap-2 text-[17px] font-semibold text-grow-d">
            <Icon name="drop" size={19} />
            {t('doseFor', { n: r.tankSizeLitres })}
          </div>
          <p className="mt-2 text-[14px] leading-snug text-grow">{t('doseSource')}</p>
        </section>
      ) : null}

      {escalateReason ? (
        <div className="mt-3">
          <EscalateCard reason={escalateReason} />
        </div>
      ) : null}

      <Card className="mt-3 px-5 py-4">
        <EyebrowLabel>{t('waiting')}</EyebrowLabel>
        {r.waitingPeriodDays != null ? (
          <>
            <div className="mt-2">
              <BigValue size={48} value={<span className="num">{r.waitingPeriodDays}</span>} unit={tc('units.days')} />
            </div>
            <div className="mt-2 flex items-start gap-2 text-[16px] font-semibold leading-snug text-ink-2">
              <Icon name="calendar" size={19} className="mt-px text-amber" />
              {t('harvestAfter', { n: r.waitingPeriodDays })}
            </div>
          </>
        ) : (
          <p className="mt-2 text-[16px] leading-snug text-ink-2">{t('waitingUnknown')}</p>
        )}
      </Card>

      <ListCard className="mt-3" title={t('warnings')} icon="alert" tone="danger" items={r.warnings} />
      <ListCard className="mt-3" title={t('safety')} icon="check" tone="grow" items={r.safety} />

      <div className="mt-5">
        <Button icon="camera" onClick={onReadAnother}>
          {t('readAnother')}
        </Button>
      </div>

      <AiTag model={r.model} />
    </>
  )
}
