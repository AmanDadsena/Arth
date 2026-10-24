import { useTranslation } from 'react-i18next'
import type { FarmerProfile } from '@/lib/api/types'
import { fmtDate, useLang } from '@/i18n'
import { Badge } from '@/components/ui'
import { PIcon } from './parts'

/**
 * Who this is: initial on a dawn gradient, name, village · district, the
 * Google account, and a few earned badges.
 */
export function ProfileHero({ f, email }: { f: FarmerProfile; email: string | null }) {
  const { t } = useTranslation('profile')
  const { lang } = useLang()
  const initial = f.name.trim().charAt(0).toUpperCase() || '?'

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
    </div>
  )
}
