import { useTranslation } from 'react-i18next'
import type { FieldCrop, MonsoonOnset, SeasonSpan } from '@/lib/api/types'
import { fmtDate, useLang } from '@/i18n'

/**
 * The farming year on one card, worked out from today's date: the three
 * sowing seasons as bands, each of the farmer's crops as a row of stages, the
 * district's expected monsoon onset, and a line through all of it at today.
 * Positions are by day of the year, so the map reads like a wall calendar.
 */

const SEASON_TONE: Record<SeasonSpan['season'], string> = {
  kharif: 'bg-grow/80 text-white',
  rabi: 'bg-amber/75 text-white',
  zaid: 'bg-warn/60 text-white',
}
const PHASE_TONE: Record<FieldCrop['phase'], string> = {
  sow: 'bg-grow',
  grow: 'bg-grow/45',
  protect: 'bg-amber',
  harvest: 'bg-warn',
  rest: 'bg-track',
}

function doy(mmdd: string) {
  const [m, d] = mmdd.split('-').map(Number)
  return Math.round((Date.UTC(2001, m! - 1, d!) - Date.UTC(2001, 0, 1)) / 86_400_000)
}

/** One MM-DD span as 1–2 [left%, width%] pieces (a span crossing the new year is split). */
function pieces(start: string, end: string): [number, number][] {
  const a = doy(start)
  const b = doy(end) + 1
  if (b > a) return [[(a / 365) * 100, ((b - a) / 365) * 100]]
  return [
    [(a / 365) * 100, ((365 - a) / 365) * 100],
    [0, (b / 365) * 100],
  ]
}

const MONTHS_EN = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export function YearMap({ today, seasons, crops, onset }: { today: string; seasons: SeasonSpan[]; crops: FieldCrop[]; onset: MonsoonOnset | null }) {
  const { t } = useTranslation('calendar')
  const { lang } = useLang()
  const todayPct = (doy(today.slice(5)) / 365) * 100
  const onsetPct = onset ? (doy(onset.expected.slice(5)) / 365) * 100 : null
  const months = MONTHS_EN.map((m, i) => (lang === 'en' ? m : fmtDate(`2001-${String(i + 1).padStart(2, '0')}-01`, lang, { month: 'narrow' })))

  return (
    <div className="rounded-[26px] bg-card px-4 pb-4 pt-3.5" role="img" aria-label={t('map.a11y', { date: fmtDate(today, lang, { day: 'numeric', month: 'long' }) })}>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-[1.4px] text-faint">{t('map.title')}</span>
        <span className="num text-[12.5px] font-semibold text-grow">{fmtDate(today, lang, { day: 'numeric', month: 'short' })}</span>
      </div>

      <div className="relative mt-3">
        {/* today, through every row */}
        <div aria-hidden className="pointer-events-none absolute -bottom-1 -top-1 z-10 w-0.5 rounded-full bg-ink" style={{ left: `${todayPct}%` }}>
          <span className="absolute -top-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-ink ring-2 ring-white" />
        </div>

        {/* seasons */}
        <div className="relative h-7 overflow-hidden rounded-xl bg-chip">
          {seasons.map((s) =>
            pieces(s.start, s.end).map(([l, w], i) => (
              <span
                key={`${s.season}-${i}`}
                className={`absolute inset-y-0 flex items-center justify-center overflow-hidden whitespace-nowrap text-[11.5px] font-semibold ${SEASON_TONE[s.season]}`}
                style={{ left: `${l}%`, width: `${w}%` }}
              >
                {w > 12 ? s.name : ''}
              </span>
            )),
          )}
          {onsetPct !== null ? (
            <span aria-hidden className="absolute inset-y-0 w-[3px] bg-white/90" style={{ left: `${onsetPct}%` }} />
          ) : null}
        </div>

        {/* the farmer's crops */}
        {crops.map((c) => (
          <div key={c.crop} className="mt-2.5">
            <div className="mb-1 text-[12.5px] font-semibold text-ink-2">{c.name}</div>
            <div className="relative h-3.5 overflow-hidden rounded-full bg-chip">
              {c.year.map((st) =>
                pieces(st.start, st.end).map(([l, w], i) => (
                  <span key={`${st.start}-${i}`} title={st.name} className={`absolute inset-y-0 ${PHASE_TONE[st.phase]}`} style={{ left: `${l}%`, width: `${w}%` }} />
                )),
              )}
            </div>
          </div>
        ))}

        {/* months */}
        <div aria-hidden className="mt-2 grid grid-cols-12 text-center text-[11px] font-semibold text-faint">
          {months.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
      </div>

      {crops.length ? (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
          {(['sow', 'grow', 'protect', 'harvest'] as const).map((p) => (
            <span key={p} className="inline-flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-full ${PHASE_TONE[p]}`} />
              {t(`phase.${p}`)}
            </span>
          ))}
        </div>
      ) : null}
      {onset ? (
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted">
          <span aria-hidden className="h-3 w-[3px] rounded-full bg-grow" />
          {t('map.onset', { date: fmtDate(onset.expected, lang, { day: 'numeric', month: 'short' }) })}
        </p>
      ) : null}
    </div>
  )
}
