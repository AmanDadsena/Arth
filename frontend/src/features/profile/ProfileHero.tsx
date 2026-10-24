import { useTranslation } from 'react-i18next'
import type { FarmerProfile } from '@/lib/api/types'
import { fmtDate, useLang } from '@/i18n'
import { Badge } from '@/components/ui'
import { completeness } from './profileData'
import { PIcon, Ring } from './parts'

/**
 * Who this is and how complete the profile is: initial on a dawn gradient,
 * name, village · district, a few earned badges, and one clear next step.
 */
export function ProfileHero({ f, demo, email, onFinish, onFinishCore }: { f: FarmerProfile; demo: boolean; email: string | null; onFinish: () => void; onFinishCore: () => void }) {
  const { t } = useTranslation('profile')
  const { lang } = useLang()
  const { pct, missing, coreMissing } = completeness(f)
  const initial = f.name.trim().charAt(0).toUpperCase() || '?'
  const done = pct >= 100

  return (
    <div
      className="relative overflow-hidden rounded-[30px] px-5 pb-5 pt-5"
      style={{ background: 'linear-gradient(160deg, #fbf3e2 0%, #f6dfc0 42%, #e3ecd7 100%)' }}
    >
      {/* a sun low on the horizon, the same motif as the login screen */}
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/45 blur-2xl" />
      <svg aria-hidden viewBox="0 0 360 60" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-14 w-full">
        <path d="M0 40 C 70 20, 140 22, 200 34 S 310 46, 360 28 V60 H0z" fill="#2e6b3f" opacity=".08" />
        <path d="M0 50 C 90 36, 170 40, 240 48 S 330 54, 360 44 V60 H0z" fill="#2e6b3f" opacity=".10" />
      </svg>

      <div className="relative flex items-center gap-4">
        <div className="display flex h-[72px] w-[72px] flex-none items-center justify-center rounded-[26px] bg-grow text-[34px] text-white shadow-[0_8px_20px_rgba(46,107,63,.28)]">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="display truncate text-[29px] leading-tight text-ink">{f.name || '—'}</h1>
          <div className="mt-0.5 flex items-center gap-1.5 text-[15px] text-ink-2">
            <PIcon name="pin" size={15} />
            <span className="truncate">
              {f.village}
              {f.village && f.district ? <span className="mx-1.5 text-faint">·</span> : null}
              {f.district}
            </span>
          </div>
          {email ? <div className="mt-0.5 truncate text-[13px] text-muted">{t('signedInAs', { email })}</div> : null}
        </div>
      </div>

      <div className="relative mt-3 flex flex-wrap gap-1.5">
        {demo ? (
          <Badge tone="amber">
            <PIcon name="star" size={12} />
            {t('demoUser')}
          </Badge>
        ) : null}
        {f.farmingType === 'organic' || f.farmingType === 'mixed' ? (
          <Badge tone="grow">
            <PIcon name="sprout" size={12} />
            {t(f.farmingType === 'organic' ? 'hero.organic' : 'hero.mixed')}
          </Badge>
        ) : null}
        {typeof f.experienceYears === 'number' && f.experienceYears > 0 ? (
          <Badge tone="neutral" className="bg-white/70">
            <PIcon name="clock" size={12} />
            <span className="num">{t('hero.years', { count: f.experienceYears })}</span>
          </Badge>
        ) : null}
        {f.createdAt ? (
          <Badge tone="neutral" className="bg-white/70">
            {t('hero.memberSince', { date: fmtDate(f.createdAt, lang, { month: 'short', year: 'numeric' }) })}
          </Badge>
        ) : null}
      </div>

      {/* completion: the ring plus the one thing to do next */}
      <div className="relative mt-4 flex items-center gap-3.5 rounded-[24px] bg-white/70 p-3 backdrop-blur-sm">
        <div className="relative flex-none">
          <Ring pct={pct} size={64} />
          <span className="num absolute inset-0 flex items-center justify-center text-[16px] font-bold text-grow-d">
            {done ? <PIcon name="check" size={24} /> : `${pct}%`}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold leading-snug text-ink">{done ? t('hero.allDone') : t('hero.complete', { pct })}</div>
          <div className="mt-0.5 text-[13.5px] leading-snug text-muted">
            {done ? t('hero.allDoneHint') : t('hero.completeHint', { count: missing.length + (coreMissing ? 1 : 0) })}
          </div>
        </div>
      </div>
      {!done ? (
        <button
          type="button"
          onClick={coreMissing ? onFinishCore : onFinish}
          className="relative mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-3xl bg-ink text-[16px] font-semibold text-white active:brightness-125"
        >
          <PIcon name="sparkle" size={18} />
          {coreMissing ? t('hero.finishCore') : t('hero.finish')}
        </button>
      ) : null}
    </div>
  )
}
