import { useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { AiTag, Button, Card, EmptyState, ErrorState, EscalateCard, EyebrowLabel, Icon, SectionHead, Skeleton } from '@/components/ui'
import { api } from '@/lib/api/client'
import type { SellAdvice, SellAdviceRequest } from '@/lib/api/types'
import { rupees, useLang } from '@/i18n'
import { MAX_QUINTALS, parseQuintals } from './commodities'
import { useSpeech } from './useSpeech'
import { langOfLocale, NoVoiceHint } from '@/components/voice'

const QUICK = [5, 10, 25, 50]
const N = <span className="num" />

/**
 * Sell Smart: quantity → POST /mandi/sell-advice → sell now or wait, best market
 * after transport, every option compared. Mounted per commodity + language.
 */
export function SellSmartView({ commodity, lat, lon }: { commodity: string; lat: number; lon: number }) {
  const { t } = useTranslation('mandi')
  const { t: tc } = useTranslation('common')
  const { lang } = useLang()
  const [qty, setQty] = useState('10')
  const [touched, setTouched] = useState(false)
  const [failures, setFailures] = useState(0)
  const resultRef = useRef<HTMLDivElement>(null)

  const advice = useMutation<SellAdvice, Error, SellAdviceRequest>({
    mutationFn: (body) => api.postSellAdvice(body),
    onSuccess: () => {
      setFailures(0)
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    },
    onError: () => setFailures((f) => f + 1),
  })

  const quintals = parseQuintals(qty)
  const crop = tc(`crops.${commodity}`)

  function submit(e?: FormEvent) {
    e?.preventDefault()
    setTouched(true)
    if (quintals === null || advice.isPending) return
    advice.mutate({ commodity, quantityQuintals: quintals, lat, lon, lang })
  }

  function onType(raw: string) {
    const v = raw.replace(',', '.')
    if (/^\d{0,5}(\.\d?)?$/.test(v)) setQty(v)
  }

  const showInvalid = touched && quintals === null

  return (
    <>
      <form onSubmit={submit} noValidate>
        <Card className="px-5 py-5">
          <div className="display text-[22px] leading-tight text-ink">{t('sell.intro')}</div>
          <p className="mt-1 text-[15px] leading-snug text-muted">{t('sell.help')}</p>

          <label htmlFor="mandi-qty" className="mt-5 block text-[14px] font-semibold text-faint">
            {t('sell.quantityLabel')} · {crop}
          </label>
          <div
            className={`mt-2 flex items-baseline gap-3 rounded-[22px] bg-chip px-5 py-3 focus-within:ring-2 ${
              showInvalid ? 'ring-2 ring-warn' : 'focus-within:ring-grow'
            }`}
          >
            <input
              id="mandi-qty"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="go"
              value={qty}
              onChange={(e) => onType(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={showInvalid || undefined}
              aria-describedby={showInvalid ? 'mandi-qty-err' : undefined}
              placeholder="0"
              className="num h-14 w-full min-w-0 bg-transparent text-[44px] font-semibold leading-none text-ink outline-none placeholder:text-hint"
            />
            <span className="flex-none text-[17px] font-medium text-faint">{tc('units.quintal')}</span>
          </div>
          {showInvalid ? (
            <p id="mandi-qty-err" className="mt-2 text-[14px] font-medium text-warn-d">
              {t('sell.invalid', { max: MAX_QUINTALS })}
            </p>
          ) : null}

          <div role="group" aria-label={t('sell.quick')} className="mt-3 grid grid-cols-4 gap-2">
            {QUICK.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={quintals === n}
                onClick={() => {
                  setQty(String(n))
                  setTouched(false)
                }}
                className={`num h-12 rounded-2xl text-[17px] font-semibold transition ${quintals === n ? 'bg-grow text-white' : 'bg-chip text-ink-2 active:brightness-95'}`}
              >
                {n}
              </button>
            ))}
          </div>

          <Button type="submit" icon={advice.isPending ? undefined : 'sparkle'} loading={advice.isPending} disabled={quintals === null} className="mt-5">
            {advice.isPending ? t('sell.submitting') : t('sell.submit')}
          </Button>
        </Card>
      </form>

      <div ref={resultRef} className="scroll-mt-4">
        {advice.isPending ? (
          <div role="status" aria-label={tc('loading')} className="mt-4 space-y-3">
            <Skeleton className="h-[230px] w-full" rounded="rounded-[28px]" />
            <Skeleton className="h-[120px] w-full" rounded="rounded-[28px]" />
            <Skeleton className="h-[200px] w-full" rounded="rounded-[28px]" />
          </div>
        ) : advice.isError ? (
          <div className="mt-4 space-y-3">
            <ErrorState error={advice.error} title={t('sell.errorTitle')} onRetry={() => advice.variables && advice.mutate(advice.variables)} />
            {failures >= 2 ? <EscalateCard reason={t('escalate.advice')} /> : null}
          </div>
        ) : advice.data ? (
          advice.data.options.length === 0 ? (
            <div className="mt-4 space-y-3">
              <EmptyState icon="mandi" title={t('sell.noOptionsTitle')} body={t('sell.noOptionsBody', { crop })} />
              <EscalateCard reason={t('escalate.advice')} />
            </div>
          ) : (
            <AdviceResult advice={advice.data} quantity={advice.variables?.quantityQuintals ?? quintals ?? 0} crop={crop} />
          )
        ) : null}
      </div>
    </>
  )
}

function AdviceResult({ advice, quantity, crop }: { advice: SellAdvice; quantity: number; crop: string }) {
  const { t } = useTranslation('mandi')
  const { t: tc } = useTranslation('common')
  const { locale } = useLang()
  const speech = useSpeech()
  const sellNow = advice.recommendation === 'SELL_NOW'
  const options = [...advice.options].sort((a, b) => b.netEarning - a.netEarning)
  const bestName = options.some((o) => o.market === advice.bestMarket) ? advice.bestMarket : options[0]!.market
  const km = tc('units.km')

  const slope = Math.round(advice.trendSlope)
  const slopeKey = Math.abs(slope) < 1 ? 'sell.slopeFlat' : slope > 0 ? 'sell.slopeUp' : 'sell.slopeDown'

  return (
    <>
      {/* Recommendation */}
      <div
        className={`mt-4 rounded-[28px] px-5 py-5 ${sellNow ? 'bg-grow text-white' : 'bg-amber-l text-ink'}`}
        aria-live="polite"
      >
        <div className={`text-[14px] font-semibold ${sellNow ? 'text-white/70' : 'text-amber'}`}>{t('sell.ourAdvice')}</div>
        <div className="mt-1.5 flex items-center gap-2.5">
          <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${sellNow ? 'bg-white/15' : 'bg-card text-amber'}`}>
            <Icon name={sellNow ? 'check' : 'calendar'} size={20} />
          </span>
          <div className={`display text-[32px] leading-tight ${sellNow ? 'text-white' : 'text-amber'}`}>{t(`sell.${advice.recommendation}`)}</div>
        </div>

        <div className={`mt-4 text-[14px] ${sellNow ? 'text-white/75' : 'text-muted'}`}>{sellNow ? t('sell.netNow') : t('sell.netToday')}</div>
        <div className="num mt-0.5 text-[40px] font-semibold leading-none tracking-tight">{rupees(advice.netEarning)}</div>
        <div className={`mt-1.5 text-[14px] ${sellNow ? 'text-white/75' : 'text-muted'}`}>
          <Trans t={t} i18nKey="sell.forQty" values={{ qty: quantity, crop }} components={{ n: N }} />
        </div>

        <div className={`mt-4 flex items-center gap-2 text-[16px] font-semibold ${sellNow ? 'text-white' : 'text-ink'}`}>
          <Icon name="pin" size={17} />
          {t('sell.bestMarket', { market: bestName })}
        </div>
        <div className={`mt-1 text-[14px] ${sellNow ? 'text-white/75' : 'text-muted'}`}>
          <Trans t={t} i18nKey={slopeKey} values={{ amount: rupees(Math.abs(slope)) }} components={{ n: N }} />
        </div>

        {speech.supported && advice.reasoning ? (
          <button
            type="button"
            onClick={() => (speech.speaking ? speech.stop() : speech.speak(advice.reasoning, locale))}
            aria-pressed={speech.speaking}
            className={`mt-5 inline-flex h-12 items-center gap-2.5 rounded-3xl px-5 text-[16px] font-semibold transition active:brightness-95 ${
              sellNow ? 'bg-white/15 text-white' : 'bg-card text-ink'
            }`}
          >
            <Icon name={speech.speaking ? 'close' : 'speaker'} size={20} />
            {speech.speaking ? t('sell.stop') : t('sell.listen')}
          </button>
        ) : null}
        <NoVoiceHint lang={langOfLocale(locale)} />
      </div>

      {/* Reasoning */}
      {advice.reasoning ? (
        <Card className="mt-3 px-5 py-5">
          <EyebrowLabel>{t('sell.why')}</EyebrowLabel>
          <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{advice.reasoning}</p>
        </Card>
      ) : null}

      {/* Options compared */}
      <SectionHead>{t('sell.compare')}</SectionHead>
      <ul className="space-y-2">
        {options.map((o) => {
          const best = o.market === bestName
          return (
            <li key={o.market} className={`rounded-[22px] px-4 py-3.5 ${best ? 'bg-grow-l ring-2 ring-grow' : 'bg-card'}`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`text-[17px] font-semibold leading-tight ${best ? 'text-grow-d' : 'text-ink'}`}>{o.market}</span>
                    {best ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-grow px-2 py-1 text-[12px] font-semibold text-white">
                        <Icon name="check" size={12} />
                        {t('sell.best')}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[14px] text-muted">
                    <span className="num">{o.distanceKm}</span> {km}
                  </div>
                </div>
                <div className="flex-none text-right">
                  <div className="text-[12px] text-faint">{t('sell.net')}</div>
                  <div className={`num text-[19px] font-semibold ${best ? 'text-grow-d' : 'text-ink'}`}>{rupees(o.netEarning)}</div>
                </div>
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-2 text-[13px]">
                <div className={`rounded-xl px-3 py-1.5 ${best ? 'bg-card/70' : 'bg-chip'}`}>
                  <dt className="text-faint">{t('sell.price')}</dt>
                  <dd className="font-semibold text-ink-2">
                    <span className="num">{rupees(o.modalPrice)}</span>
                    <span className="font-normal text-faint"> / {tc('units.quintal')}</span>
                  </dd>
                </div>
                <div className={`rounded-xl px-3 py-1.5 ${best ? 'bg-card/70' : 'bg-chip'}`}>
                  <dt className="text-faint">{t('sell.transport')}</dt>
                  <dd className="num font-semibold text-ink-2">−{rupees(o.transportCost)}</dd>
                </div>
              </dl>
            </li>
          )
        })}
      </ul>

      <AiTag />
    </>
  )
}
