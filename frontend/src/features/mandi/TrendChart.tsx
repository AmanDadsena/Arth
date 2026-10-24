import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import type { Lang, PricePoint } from '@/lib/api/types'
import { fmtDate, rupees } from '@/i18n'

/** 30-day modal-price line. Its own file so Recharts loads only with the Prices tab. */

const GROW = '#2E6B3F'
const FAINT = '#8a8574'
const HAIR = '#ece8dc'
const TRACK = '#d6d1c2'
const NUM_FONT = 'Inter, system-ui, sans-serif'

const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function TrendTooltip({ active, payload, lang }: TooltipContentProps<number, string> & { lang: Lang }) {
  const point = payload?.[0]?.payload as PricePoint | undefined
  if (!active || !point) return null
  return (
    <div className="rounded-2xl bg-ink px-3 py-2 text-white shadow-lg">
      <div className="text-[12px] text-white/70">{fmtDate(point.date, lang, { day: 'numeric', month: 'short', weekday: 'short' })}</div>
      <div className="num text-[16px] font-semibold">{rupees(point.modalPrice)}</div>
    </div>
  )
}

export default function TrendChart({ points, lang, label }: { points: PricePoint[]; lang: Lang; label: string }) {
  return (
    <div className="h-[184px] w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="mandi-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GROW} stopOpacity={0.16} />
              <stop offset="100%" stopColor={GROW} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={HAIR} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => fmtDate(d, lang)}
            tick={{ fontSize: 11, fill: FAINT, fontFamily: NUM_FONT }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={32}
            tickMargin={6}
          />
          <YAxis
            domain={['auto', 'auto']}
            width={46}
            tickCount={4}
            tickFormatter={(v: number) => Math.round(v).toLocaleString('en-IN')}
            tick={{ fontSize: 11, fill: FAINT, fontFamily: NUM_FONT }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={(props) => <TrendTooltip {...(props as TooltipContentProps<number, string>)} lang={lang} />}
            cursor={{ stroke: TRACK, strokeDasharray: '3 3' }}
          />
          <Area
            type="monotone"
            dataKey="modalPrice"
            stroke={GROW}
            strokeWidth={2.5}
            fill="url(#mandi-trend-fill)"
            dot={false}
            activeDot={{ r: 5, fill: GROW, stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={!reducedMotion}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
