import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, Icon, SectionHead, type IconName } from '@/components/ui'
import type { WhyNow } from '@/lib/api/types'
import { fmtDate, useLang } from '@/i18n'

/** A folded newspaper — the shared icon set has none, and calendar can't add to it. */
function NewsIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`flex-none ${className}`}>
      <path d="M4 5h13v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z" />
      <path d="M17 9h3v9a2 2 0 0 1-2 2" />
      <path d="M7.5 9h6M7.5 12.5h6M7.5 16h4" />
    </svg>
  )
}

export const hasWhyNow = (w?: WhyNow | null): w is WhyNow =>
  !!w && (w.weather.length > 0 || w.market.length > 0 || (w.soil?.length ?? 0) > 0 || w.news.length > 0)

/** On a crop card: one weather and one market line (or a soil line). Nothing when there is no signal. */
export function WhyNowTeaser({ whyNow }: { whyNow?: WhyNow | null }) {
  const { t } = useTranslation('calendar')
  if (!whyNow) return null
  const lines: [IconName, string][] = []
  if (whyNow.weather[0]) lines.push(['weather', whyNow.weather[0]])
  if (whyNow.market[0]) lines.push(['mandi', whyNow.market[0]])
  if (lines.length < 2 && whyNow.soil?.[0]) lines.push(['sprout', whyNow.soil[0]])
  if (!lines.length) return null
  return (
    <div className="mt-3 rounded-2xl bg-grow-l px-3 py-2.5">
      <div className="text-[12px] font-semibold uppercase tracking-[1.2px] text-grow-d">{t('whyNow.teaser')}</div>
      <ul className="mt-1 space-y-1">
        {lines.map(([icon, text]) => (
          <li key={icon} className="flex items-start gap-2 text-[14px] leading-snug text-ink-2">
            <Icon name={icon} size={16} className="mt-0.5 text-grow" />
            <span className="min-w-0">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="pt-1">
      <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[1.4px] text-faint">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-grow-l text-grow">{icon}</span>
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function Lines({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((line) => (
        <li key={line} className="flex items-start gap-2 text-[15px] leading-snug text-ink-2">
          <Icon name="check" size={16} className="mt-0.5 text-grow" />
          <span className="min-w-0">{line}</span>
        </li>
      ))}
    </ul>
  )
}

/** The full "Why sow this now" block in a crop's plan: weather, market, soil and news groups; empty ones hidden. */
export function WhyNowSection({ whyNow }: { whyNow?: WhyNow | null }) {
  const { t } = useTranslation('calendar')
  const { lang } = useLang()
  if (!hasWhyNow(whyNow)) return null
  return (
    <>
      <SectionHead>{t('whyNow.title')}</SectionHead>
      <Card className="space-y-4 px-5 py-4">
        {whyNow.weather.length ? (
          <Group icon={<Icon name="weather" size={16} />} title={t('whyNow.weather')}>
            <Lines items={whyNow.weather} />
          </Group>
        ) : null}
        {whyNow.market.length ? (
          <Group icon={<Icon name="mandi" size={16} />} title={t('whyNow.market')}>
            <Lines items={whyNow.market} />
          </Group>
        ) : null}
        {whyNow.soil?.length ? (
          <Group icon={<Icon name="sprout" size={16} />} title={t('whyNow.soil')}>
            <Lines items={whyNow.soil} />
          </Group>
        ) : null}
        {whyNow.news.length ? (
          <Group icon={<NewsIcon size={16} />} title={t('whyNow.news')}>
            <ul className="space-y-2">
              {whyNow.news.map((n) => (
                <li key={n.url}>
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${n.headline}. ${t('whyNow.readMore', { source: n.source })}`}
                    className="flex min-h-12 items-start gap-3 rounded-2xl bg-chip px-3.5 py-3 active:bg-track"
                  >
                    <NewsIcon size={18} className="mt-0.5 text-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold leading-snug text-ink">{n.headline}</span>
                      <span className="num mt-1 block text-[13px] text-faint">
                        {n.source} · {fmtDate(n.date, lang, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </span>
                    <Icon name="chevron" size={16} className="mt-1 text-faint" />
                  </a>
                </li>
              ))}
            </ul>
          </Group>
        ) : null}
        <p className="border-t border-hair pt-3 text-[13px] leading-snug text-faint">{t('whyNow.footnote')}</p>
      </Card>
    </>
  )
}
