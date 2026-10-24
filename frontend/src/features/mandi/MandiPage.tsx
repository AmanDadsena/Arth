import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ErrorState, PageHeader, SkeletonScreen } from '@/components/ui'
import { round2, useFarmer } from '@/lib/api/queries'
import { useLang } from '@/i18n'
import { defaultCommodity, farmerCommodities, isMandiCommodity, type MandiCommodity } from './commodities'
import { PricesView } from './PricesView'
import { SellSmartView } from './SellSmartView'

type Tab = 'prices' | 'sell'

/**
 * Mandi tab: today's prices at nearby markets + a 30-day trend, and Sell Smart
 * (where to sell after transport, now or wait). Deep links: /mandi?tab=sell&crop=tomato.
 * Tab and crop are local state after the first render — changing the URL would
 * remount the whole screen (the shell keys <main> on location).
 */
export default function MandiPage() {
  const { t } = useTranslation('mandi')
  const { t: tc } = useTranslation('common')
  const { lang } = useLang()
  const [params] = useSearchParams()
  const farmer = useFarmer()
  const [tab, setTab] = useState<Tab>(() => (params.get('tab') === 'sell' ? 'sell' : 'prices'))
  const [picked, setPicked] = useState<MandiCommodity | null>(() => {
    const c = params.get('crop')
    return isMandiCommodity(c) ? c : null
  })

  if (farmer.isError) {
    return (
      <>
        <PageHeader title={t('title')} back={false} />
        <div className="mt-4">
          <ErrorState error={farmer.error} onRetry={() => void farmer.refetch()} />
        </div>
      </>
    )
  }
  if (!farmer.data) return <SkeletonScreen cards={3} />

  const f = farmer.data
  const lat = round2(f.lat)
  const lon = round2(f.lon)
  const choices = farmerCommodities(f.crops)
  // a crop from a link (?crop=) or an old pick counts only if the farmer grows it
  const commodity = picked && choices.includes(picked) ? picked : defaultCommodity(choices)

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle', { place: f.village || f.district })} back={false} />

      {/* Prices | Sell Smart */}
      <div role="tablist" aria-label={t('tabs.label')} className="mt-3 flex gap-1 rounded-[24px] bg-chip p-1">
        {(['prices', 'sell'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`mandi-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`mandi-panel-${id}`}
            onClick={() => setTab(id)}
            className={`h-12 flex-1 rounded-[20px] px-3 text-[16px] font-semibold transition ${
              tab === id ? 'bg-card text-ink shadow-[0_1px_3px_rgba(30,26,16,.12)]' : 'text-muted active:bg-card/50'
            }`}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>

      {/* Commodity picker */}
      <div role="group" aria-label={t('pickCrop')} className="mt-4 flex flex-wrap gap-2">
        {choices.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={commodity === c}
            onClick={() => setPicked(c)}
            className={`h-12 rounded-2xl px-4 text-[15px] font-semibold transition ${
              commodity === c ? 'bg-grow text-white' : 'bg-card text-ink-2 active:bg-chip'
            }`}
          >
            {tc(`crops.${c}`)}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'prices' ? (
          <div role="tabpanel" id="mandi-panel-prices" aria-labelledby="mandi-tab-prices">
            <PricesView commodity={commodity} lat={lat} lon={lon} onGoSell={() => setTab('sell')} />
          </div>
        ) : null}
        {/* kept mounted while hidden so an answer survives a look at the prices */}
        <div role="tabpanel" id="mandi-panel-sell" aria-labelledby="mandi-tab-sell" hidden={tab !== 'sell'}>
          <SellSmartView key={`${commodity}:${lang}`} commodity={commodity} lat={lat} lon={lon} />
        </div>
      </div>
    </>
  )
}
