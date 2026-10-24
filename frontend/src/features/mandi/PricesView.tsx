import { lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { Badge, Button, Card, Chip, EmptyState, ErrorState, EscalateCard, EyebrowLabel, BigValue, Icon, SectionHead, Skeleton } from '@/components/ui'
import { api } from '@/lib/api/client'
import { qk } from '@/lib/api/queries'
import type { MandiPrices } from '@/lib/api/types'
import { fmtDate, rupees, useLang } from '@/i18n'

const TrendChart = lazy(() => import('./TrendChart'))

const N = <span className="num" />

/** Week-on-week price move: up is good news for a seller, so it is green. */
export function ChangeChip({ pct }: { pct: number }) {
  const { t } = useTranslation('mandi')
  const flat = Math.abs(pct) < 0.5
  if (flat) return <Chip tone="neutral">{t('change.flat')}</Chip>
  const up = pct > 0
  return (
    <Chip tone={up ? 'grow' : 'warn'}>
      <Icon name={up ? 'up' : 'down'} size={15} />
      <span>
        <Trans t={t} i18nKey={up ? 'change.up' : 'change.down'} values={{ pct: Math.abs(pct).toFixed(1) }} components={{ n: N }} />
      </span>
    </Chip>
  )
}

function PricesSkeleton() {
  const { t } = useTranslation('common')
  return (
    <div role="status" aria-label={t('loading')} className="space-y-3">
      <Skeleton className="h-[176px] w-full" rounded="rounded-[28px]" />
      <Skeleton className="mt-6 h-6 w-1/2" rounded="rounded-lg" />
      <Skeleton className="h-[220px] w-full" rounded="rounded-[28px]" />
      <Skeleton className="h-[240px] w-full" rounded="rounded-[28px]" />
    </div>
  )
}

export function PricesView({ commodity, lat, lon, onGoSell }: { commodity: string; lat: number; lon: number; onGoSell: () => void }) {
  const { t } = useTranslation('mandi')
  const { t: tc } = useTranslation('common')
  const prices = useQuery<MandiPrices, Error>({
    queryKey: qk.mandiPrices(commodity, lat, lon),
    queryFn: () => api.getMandiPrices(commodity, lat, lon),
  })
  const crop = tc(`crops.${commodity}`)

  if (prices.isPending) return <PricesSkeleton />
  if (prices.isError) {
    return (
      <div className="space-y-3">
        <ErrorState error={prices.error} title={t('error.prices')} onRetry={() => void prices.refetch()} />
        {prices.errorUpdateCount >= 2 ? <EscalateCard reason={t('escalate.prices')} /> : null}
      </div>
    )
  }

  const data = prices.data
  const markets = [...data.markets].sort((a, b) => b.modalPrice - a.modalPrice)
  const top = markets[0]
  if (!top) {
    return (
      <div className="space-y-3">
        <EmptyState icon="mandi" title={t('empty.title')} body={t('empty.body', { crop })} />
        <EscalateCard reason={t('escalate.prices')} />
      </div>
    )
  }

  return <PricesBody data={data} markets={markets} crop={crop} onGoSell={onGoSell} />
}

function PricesBody({ data, markets, crop, onGoSell }: { data: MandiPrices; markets: MandiPrices['markets']; crop: string; onGoSell: () => void }) {
  const { t } = useTranslation('mandi')
  const { t: tc } = useTranslation('common')
  const { lang } = useLang()
  const top = markets[0]!
  const nearestKm = Math.min(...markets.map((m) => m.distanceKm))
  const km = tc('units.km')

  const trend = data.trend
  const trendPrices = trend.map((p) => p.modalPrice)
  const low = trendPrices.length ? Math.min(...trendPrices) : null
  const high = trendPrices.length ? Math.max(...trendPrices) : null
  const first = trend[0]
  const last = trend[trend.length - 1]

  return (
    <>
      {/* Best price today */}
      <Card className="px-5 py-5">
        <EyebrowLabel>
          {crop} · {t('bestToday')}
        </EyebrowLabel>
        <div className="mt-3">
          <BigValue value={<span className="num font-semibold tracking-tight">{rupees(top.modalPrice)}</span>} unit={t('perQuintal')} size={48} />
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[16px] font-semibold text-ink-2">
          <Icon name="pin" size={16} />
          <span className="truncate">{top.market}</span>
          <span className="flex-none font-normal text-muted">
            · <span className="num">{top.distanceKm}</span> {km}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ChangeChip pct={data.changePct7d} />
          <span className="text-[13px] text-faint">{t('asOf', { date: fmtDate(data.asOf, lang) })}</span>
        </div>
      </Card>

      {/* Nearby markets */}
      <SectionHead>{t('markets')}</SectionHead>
      <Card className="py-1">
        <ul className="divide-y divide-hair">
          {markets.map((m, i) => (
            <li key={`${m.market}-${m.district}`} className="flex min-h-[72px] items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[17px] font-semibold leading-tight text-ink">{m.market}</span>
                  {i === 0 ? <Badge tone="grow">{t('highest')}</Badge> : null}
                  {m.distanceKm === nearestKm && i !== 0 ? <Badge>{t('nearest')}</Badge> : null}
                </div>
                <div className="mt-0.5 text-[14px] text-muted">
                  {m.district} · <span className="num">{m.distanceKm}</span> {km}
                </div>
              </div>
              <div className="flex-none text-right">
                <div className="num text-[19px] font-semibold text-ink">{rupees(m.modalPrice)}</div>
                <div className="num text-[12.5px] text-faint">
                  <span className="sr-only">{t('lowHigh')}: </span>
                  {rupees(m.minPrice)}–{rupees(m.maxPrice)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mx-1 mt-2 text-[13px] leading-snug text-faint">{t('modalNote')}</p>

      {/* 30-day trend */}
      {first && last ? (
        <>
          <SectionHead>{t('trend.title')}</SectionHead>
          <Card className="px-3 pb-4 pt-4">
            <div className="px-2 text-[14px] text-muted">{t('trend.market', { market: data.trendMarket })}</div>
            <div className="mt-2">
              <Suspense fallback={<Skeleton className="h-[184px] w-full" rounded="rounded-2xl" />}>
                <TrendChart
                  points={trend}
                  lang={lang}
                  label={t('trend.aria', { market: data.trendMarket, from: rupees(first.modalPrice), to: rupees(last.modalPrice) })}
                />
              </Suspense>
            </div>
            {low !== null && high !== null ? (
              <div className="mt-3 grid grid-cols-2 gap-2 px-2">
                <div className="rounded-2xl bg-chip px-3 py-2.5">
                  <div className="text-[12.5px] text-faint">{t('trend.low')}</div>
                  <div className="num text-[17px] font-semibold text-ink">{rupees(low)}</div>
                </div>
                <div className="rounded-2xl bg-chip px-3 py-2.5">
                  <div className="text-[12.5px] text-faint">{t('trend.high')}</div>
                  <div className="num text-[17px] font-semibold text-ink">{rupees(high)}</div>
                </div>
              </div>
            ) : null}
          </Card>
        </>
      ) : null}

      {/* Bridge to Sell Smart */}
      <Card className="mt-6 px-5 py-5">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-grow-l text-grow">
            <Icon name="mandi" />
          </span>
          <div className="min-w-0">
            <div className="display text-[20px] leading-tight text-ink">{t('goSell.title')}</div>
            <p className="mt-1 text-[15px] leading-snug text-muted">{t('goSell.body')}</p>
          </div>
        </div>
        <Button size="md" icon="chevron" className="mt-4" onClick={onGoSell}>
          {t('goSell.cta')}
        </Button>
      </Card>
    </>
  )
}
