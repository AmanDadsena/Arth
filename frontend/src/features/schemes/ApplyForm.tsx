import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button, Card, EscalateCard, Icon, IconButton } from '@/components/ui'
import { api } from '@/lib/api/client'
import { useCloudSync } from '@/lib/api/queries'
import type { FarmerProfile, SchemeResult, ShareResult, VoiceResponse } from '@/lib/api/types'
import { useLang } from '@/i18n'
import { DocChecklist, OfficialLink } from './SchemeResults'
import { useVoice } from '@/components/voice'

/**
 * Application details, fillable by voice. A value heard by voice is
 * "unconfirmed" until the farmer taps ✅; ✏️ turns it into a normal input.
 * There is no applications endpoint: saving shows a ready state with the
 * official website. Name, village and bank never leave this screen; if the
 * farmer opts in, only an anonymous summary (scheme, district, crop, land
 * range) is shared, and the backend builds even that from fixed lists.
 */

const FIELDS = ['name', 'village', 'district', 'landAcres', 'crop', 'bankName'] as const
type FieldKey = (typeof FIELDS)[number]
const OPTIONAL: FieldKey[] = ['bankName']

interface Field {
  value: string
  /** filled by voice and not yet confirmed by the farmer */
  pending: boolean
}
type Form = Record<FieldKey, Field>

const emptyForm = (): Form => Object.fromEntries(FIELDS.map((k) => [k, { value: '', pending: false }])) as Form

const INPUT = 'h-[56px] w-full rounded-[20px] bg-chip px-4 text-[18px] font-medium text-ink outline-none placeholder:text-hint focus-visible:ring-2 focus-visible:ring-grow'

function VoicePanel({ state, onStart, onStop, result }: { state: string; onStart: () => void; onStop: () => void; result: VoiceResponse | null }) {
  const { t } = useTranslation('schemes')
  const recording = state === 'recording'
  const busy = state === 'processing'
  return (
    <div className="rounded-[26px] bg-ink px-5 py-5 text-white">
      <button
        type="button"
        onClick={recording ? onStop : onStart}
        disabled={busy}
        aria-pressed={recording}
        className={`flex h-[62px] w-full items-center justify-center gap-3 rounded-[34px] text-[19px] font-semibold transition ${
          recording ? 'arth-pulse bg-warn text-white' : busy ? 'bg-white/15 text-white/70' : 'bg-card text-ink active:brightness-95'
        }`}
      >
        {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="mic" />}
        {recording ? t('listening') : busy ? t('understanding') : t('voiceButton')}
      </button>
      <p className="mt-3 text-center text-[14px] leading-snug text-white/70" aria-live="polite">
        {state === 'denied' ? t('voiceDenied') : state === 'error' ? t('voiceError') : t('voiceHint')}
      </p>
      {result && state === 'idle' ? (
        <div className="mt-3 rounded-[18px] bg-white/10 px-4 py-3 text-[15px] leading-snug">
          {result.transcript ? (
            <div className="text-white/70">
              {t('youSaid')}: <span className="text-white">“{result.transcript}”</span>
            </div>
          ) : null}
          {result.reply ? <div className="mt-1 font-medium text-white">{result.reply}</div> : null}
        </div>
      ) : null}
    </div>
  )
}

function ShareOptIn({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTranslation('schemes')
  return (
    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-[22px] bg-chip px-4 py-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-6 w-6 shrink-0 accent-grow"
      />
      <span className="min-w-0">
        <span className="block text-[16px] font-semibold text-ink">{t('shareTitle')}</span>
        <span className="mt-1 block text-[14px] leading-snug text-muted">{t('shareBody')}</span>
      </span>
    </label>
  )
}

function ShareStatus({ state, result }: { state: 'pending' | 'error' | 'success' | 'idle'; result?: ShareResult }) {
  const { t } = useTranslation('schemes')
  const { t: tc } = useTranslation('common')
  if (state === 'idle') return null
  if (state === 'pending') return <p className="mt-3 text-center text-[14px] text-muted">{t('sharing')}</p>
  if (state === 'error' || !result) return <p className="mt-3 text-center text-[14px] font-semibold text-warn-d">{t('shareFailed')}</p>
  const r = result.shared
  const parts = [r.district, r.crop ? tc(`crops.${r.crop}`, { defaultValue: r.crop }) : null, r.landBand ? t('landBand', { band: r.landBand }) : null]
  return (
    <Card className="mt-3 px-5 py-4">
      <div className="flex items-center gap-2 text-[15px] font-semibold text-grow">
        <Icon name={result.status === 'sent' ? 'check' : 'cloud'} size={18} />
        {result.status === 'sent' ? t('shareSent') : t('shareQueued')}
      </div>
      <p className="mt-1.5 text-[14px] leading-snug text-muted">
        {t('shareWhat')}: {parts.filter(Boolean).join(' · ') || '—'}
      </p>
    </Card>
  )
}

function FieldRow({
  k,
  field,
  autoFocus,
  onChange,
  onConfirm,
  onEdit,
}: {
  k: FieldKey
  field: Field
  autoFocus: boolean
  onChange: (v: string) => void
  onConfirm: () => void
  onEdit: () => void
}) {
  const { t } = useTranslation('schemes')
  const label = t(`fields.${k}`)
  const id = `apply-${k}`
  return (
    <div className="mt-4">
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-2 px-1 text-[13px] font-semibold uppercase tracking-[1.2px] text-faint">
        {label}
        {OPTIONAL.includes(k) ? <span className="normal-case tracking-normal text-ghost">({t('optional')})</span> : null}
      </label>
      {field.pending ? (
        <div className="rounded-[20px] bg-amber-l p-2 pl-4">
          <div className="flex items-center gap-2">
            <output id={id} className="min-w-0 flex-1 truncate text-[18px] font-semibold text-ink">
              {field.value}
            </output>
            <button
              type="button"
              onClick={onConfirm}
              aria-label={t('confirmAria', { field: label })}
              className="flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-[18px] bg-grow px-3 text-[15px] font-semibold text-white"
            >
              <span aria-hidden>✅</span>
              <span className="hidden min-[400px]:inline">{t('confirmField')}</span>
            </button>
            <button
              type="button"
              onClick={onEdit}
              aria-label={t('editAria', { field: label })}
              className="flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-[18px] bg-card px-3 text-[15px] font-semibold text-ink"
            >
              <span aria-hidden>✏️</span>
              <span className="hidden min-[400px]:inline">{t('editField')}</span>
            </button>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-amber">
            <Icon name="mic" size={13} />
            {t('heardByVoice')}
          </div>
        </div>
      ) : (
        <input
          id={id}
          className={INPUT}
          value={field.value}
          autoFocus={autoFocus}
          inputMode={k === 'landAcres' ? 'decimal' : 'text'}
          autoComplete={k === 'name' ? 'name' : 'off'}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

export function ApplyForm({ scheme, farmer, onBack }: { scheme: SchemeResult; farmer?: FarmerProfile; onBack: () => void }) {
  const { t } = useTranslation('schemes')
  const { t: tc } = useTranslation('common')
  const { lang } = useLang()
  const cloudSync = useCloudSync()
  const [share, setShare] = useState(false)
  const shareMut = useMutation({ mutationFn: api.shareScheme })
  const voice = useVoice({ screen: 'schemes.apply', formFields: [...FIELDS] })
  const [form, setForm] = useState<Form>(emptyForm)
  const [focus, setFocus] = useState<FieldKey | null>(null)
  const [saved, setSaved] = useState(false)
  const [seen, setSeen] = useState<VoiceResponse | null>(null)

  /** Crop ids from voice ("onion") are shown in the farmer's language. */
  const display = (k: FieldKey, v: string) => (k === 'crop' ? tc(`crops.${v.trim().toLowerCase()}`, { defaultValue: v }) : v)

  // Apply each new voice result once (adjusting state during render, not in an effect).
  if (voice.result !== seen) {
    setSeen(voice.result)
    const slots = voice.result?.slots ?? {}
    const heard = FIELDS.filter((k) => typeof slots[k] === 'string' && slots[k]!.trim())
    if (heard.length) {
      setForm((cur) => {
        const next = { ...cur }
        for (const k of heard) next[k] = { value: display(k, slots[k]!.trim()), pending: true }
        return next
      })
    }
  }

  const set = (k: FieldKey, patch: Partial<Field>) => setForm((cur) => ({ ...cur, [k]: { ...cur[k], ...patch } }))

  function fromProfile() {
    if (!farmer) return
    const p: Partial<Record<FieldKey, string>> = {
      name: farmer.name,
      village: farmer.village,
      district: farmer.district,
      landAcres: String(farmer.landAcres),
      crop: farmer.crops[0] ? display('crop', farmer.crops[0]) : '',
    }
    setForm((cur) => {
      const next = { ...cur }
      for (const k of FIELDS) {
        const v = p[k]
        // the farmer's own saved profile needs no voice confirmation
        if (v) next[k] = { value: v, pending: false }
      }
      return next
    })
  }

  const pending = FIELDS.filter((k) => form[k].pending).length
  const missing = FIELDS.some((k) => !OPTIONAL.includes(k) && !form[k].value.trim())
  const acres = Number(form.landAcres.value.replace(',', '.'))
  const badAcres = !!form.landAcres.value.trim() && !(Number.isFinite(acres) && acres > 0)
  const canSave = !pending && !missing && !badAcres
  const sharing = cloudSync && share

  function save() {
    setSaved(true)
    // Only these four values are sent; the backend matches them to fixed lists and drops the rest.
    if (sharing)
      shareMut.mutate({
        schemeId: scheme.id,
        district: form.district.value.trim() || undefined,
        crop: form.crop.value.trim() || undefined,
        landAcres: Number.isFinite(acres) && acres > 0 ? acres : undefined,
        lang,
      })
  }

  if (saved) {
    return (
      <>
        <header className="flex items-start gap-3 pb-2">
          <IconButton icon="back" label={t('backToSchemes')} onClick={onBack} />
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="display text-[30px] leading-tight text-ink">{t('applyTitle')}</h1>
            <p className="mt-0.5 text-[15px] text-muted">{scheme.name}</p>
          </div>
        </header>
        <Card className="mt-3 px-5 py-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-grow text-white">
            <Icon name="check" size={28} strokeWidth={2.5} />
          </span>
          <div className="display mt-3 text-[24px] text-ink">{t('savedTitle')}</div>
          <p className="mt-1.5 text-[15px] leading-snug text-muted">{t(sharing ? 'savedBodyShared' : 'savedBody')}</p>
          <OfficialLink url={scheme.officialUrl} className="mt-4 bg-grow text-white" />
        </Card>
        {sharing ? <ShareStatus state={shareMut.status} result={shareMut.data} /> : null}

        <Card className="mt-3 px-5 py-4">
          {FIELDS.filter((k) => form[k].value.trim()).map((k) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-hair py-2.5 last:border-0">
              <span className="text-[14px] text-faint">{t(`fields.${k}`)}</span>
              <span className="text-right text-[16px] font-semibold text-ink">{form[k].value}</span>
            </div>
          ))}
        </Card>

        {scheme.documents.length ? (
          <Card className="mt-3 px-5 pb-3 pt-1">
            <DocChecklist docs={scheme.documents} />
          </Card>
        ) : null}

        <p className="mt-3 px-2 text-center text-[13px] text-faint">{t(sharing ? 'privacyNoteShared' : 'privacyNote')}</p>
        <div className="mt-4">
          <Button variant="secondary" onClick={onBack}>
            {t('backToSchemes')}
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <header className="flex items-start gap-3 pb-2">
        <IconButton icon="back" label={t('backToSchemes')} onClick={onBack} />
        <div className="min-w-0 flex-1 pt-0.5">
          <h1 className="display text-[30px] leading-tight text-ink">{t('applyTitle')}</h1>
          <p className="mt-0.5 text-[15px] text-muted">{t('applySub', { scheme: scheme.name })}</p>
        </div>
      </header>

      <div className="mt-3">
        <VoicePanel state={voice.state} onStart={voice.start} onStop={voice.stop} result={voice.result} />
      </div>
      {voice.result?.escalate ? (
        <div className="mt-3">
          <EscalateCard />
        </div>
      ) : null}

      {farmer ? (
        <button type="button" onClick={fromProfile} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 text-[15px] font-semibold text-grow">
          <Icon name="profile" size={18} />
          {t('useProfile')}
        </button>
      ) : null}

      <Card className="mt-2 px-4 pb-5 pt-1">
        {FIELDS.map((k) => (
          <FieldRow
            key={k}
            k={k}
            field={form[k]}
            autoFocus={focus === k}
            onChange={(v) => set(k, { value: v })}
            onConfirm={() => set(k, { pending: false })}
            onEdit={() => {
              set(k, { pending: false })
              setFocus(k)
            }}
          />
        ))}
      </Card>

      {cloudSync ? <ShareOptIn checked={share} onChange={setShare} /> : null}

      <div className="mt-5">
        <p className="mb-2 min-h-5 text-center text-[14px] font-semibold text-warn-d" aria-live="polite">
          {pending ? t('pendingCount', { count: pending }) : badAcres ? t('badAcres') : missing ? t('fillRequired') : ''}
        </p>
        <Button icon="check" disabled={!canSave} onClick={save}>
          {t('saveDetails')}
        </Button>
        <p className="mt-3 px-2 text-center text-[13px] text-faint">{t(sharing ? 'privacyNoteShared' : 'privacyNote')}</p>
      </div>
    </>
  )
}
