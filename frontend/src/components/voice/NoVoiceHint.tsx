import { useTranslation } from 'react-i18next'
import { Icon } from '@/components/ui'
import { LANGS } from '@/i18n'
import type { Lang } from '@/lib/api/types'
import { useMissingVoice } from './speech'

/**
 * Shown under a Listen button when the device has no voice for the language
 * (see speech.ts), instead of the button silently doing nothing.
 */
export function NoVoiceHint({ lang, className = '' }: { lang: Lang; className?: string }) {
  const { t } = useTranslation('voice')
  const missing = useMissingVoice()
  if (missing !== lang) return null
  const language = LANGS.find((l) => l.code === lang)?.label ?? lang
  return (
    <div role="status" className={`mt-2 flex gap-2.5 rounded-[18px] bg-amber-l px-4 py-3 text-ink ${className}`}>
      <Icon name="info" size={20} className="mt-0.5 shrink-0 text-amber" />
      <div>
        <div className="text-[15px] font-semibold">{t('noVoiceTitle', { language })}</div>
        <p className="mt-0.5 text-[14px] leading-snug text-muted">{t('noVoiceBody')}</p>
      </div>
    </div>
  )
}
