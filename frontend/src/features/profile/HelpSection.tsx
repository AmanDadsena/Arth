import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BottomSheet, KCC_NUMBER } from '@/components/ui'
import { FEEDBACK_EMAIL, KCC_TEL, shareApp, type ShareResult } from './profileData'
import { IconBubble, PIcon, Row, RowGroup, type PIconName } from './parts'

const GUIDE_ICONS: PIconName[] = ['home', 'mic', 'doctor', 'mandi', 'label', 'schemes']

function GuideSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('profile')
  const steps = t('guide.steps', { returnObjects: true }) as { t: string; b: string }[]
  const faq = t('guide.faq', { returnObjects: true }) as { q: string; a: string }[]
  return (
    <BottomSheet open={open} onClose={onClose} title={t('guide.title')}>
      <ol className="space-y-2">
        {(Array.isArray(steps) ? steps : []).map((s, i) => (
          <li key={i} className="flex items-start gap-3.5 rounded-[22px] bg-card p-3.5">
            <span className="relative">
              <IconBubble name={GUIDE_ICONS[i] ?? 'sparkle'} tint={i === 0 ? 'grow' : 'neutral'} />
              <span className="num absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">{i + 1}</span>
            </span>
            <span className="min-w-0">
              <span className="block text-[16px] font-semibold leading-snug text-ink">{s.t}</span>
              <span className="mt-0.5 block text-[14px] leading-snug text-muted">{s.b}</span>
            </span>
          </li>
        ))}
      </ol>
      <h3 className="display mx-1 mb-2 mt-5 text-[20px] text-ink">{t('guide.faqTitle')}</h3>
      <div className="divide-y divide-hair overflow-hidden rounded-[22px] bg-card">
        {(Array.isArray(faq) ? faq : []).map((x, i) => (
          <details key={i} className="group px-4">
            <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 text-[15.5px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
              {x.q}
              <PIcon name="chevron" size={16} className="text-hint transition group-open:rotate-90" />
            </summary>
            <p className="pb-4 text-[14.5px] leading-snug text-muted">{x.a}</p>
          </details>
        ))}
      </div>
    </BottomSheet>
  )
}

/** Kisan Call Centre first, then the guide, sharing and feedback. */
export function HelpSection() {
  const { t } = useTranslation('profile')
  const [guide, setGuide] = useState(false)
  const [shared, setShared] = useState<ShareResult | null>(null)

  async function share() {
    const r = await shareApp('Arth', t('help.shareText'))
    setShared(r === 'cancelled' ? null : r)
  }

  const shareNote = shared === 'shared' ? t('help.shared') : shared === 'copied' ? t('help.copied') : shared === 'failed' ? t('help.shareFailed') : null
  const mailto = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(t('help.feedbackSubject'))}`

  return (
    <div className="space-y-3">
      <div className="rounded-[26px] bg-ink px-5 py-5 text-white">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white/15">
            <PIcon name="phone" />
          </span>
          <div className="min-w-0">
            <div className="text-[17px] font-semibold">{t('help.kccTitle')}</div>
            <p className="mt-0.5 text-[14.5px] leading-snug text-white/75">{t('help.kccBody')}</p>
          </div>
        </div>
        <a href={KCC_TEL} className="mt-4 flex h-14 items-center justify-center gap-2.5 rounded-[28px] bg-card text-[17px] font-semibold text-ink active:brightness-95">
          <PIcon name="phone" size={20} />
          <span>{t('help.call', { n: KCC_NUMBER })}</span>
        </a>
        <div className="mt-2 text-center text-[12.5px] text-white/60">{t('help.hours')}</div>
      </div>

      <RowGroup>
        <Row icon="book" tint="grow" label={t('help.guide')} sub={t('help.guideSub')} onClick={() => setGuide(true)} />
        <Row icon="share" tint="neutral" label={t('help.share')} sub={shareNote ?? t('help.shareSub')} onClick={() => void share()} />
        <Row icon="mail" tint="neutral" label={t('help.feedback')} sub={t('help.feedbackSub')} href={mailto} />
      </RowGroup>
      {shareNote ? (
        <span role="status" className="sr-only">
          {shareNote}
        </span>
      ) : null}

      <GuideSheet open={guide} onClose={() => setGuide(false)} />
    </div>
  )
}
