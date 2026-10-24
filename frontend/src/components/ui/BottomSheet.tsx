import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Icon } from './Icon'

/** Modal bottom sheet. Closes on backdrop tap and Escape; focus moves in. */
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const { t } = useTranslation('common')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label={t('close')} onClick={onClose} className="absolute inset-0 bg-ink/45" />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className="sheet-in relative max-h-[86dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[32px] bg-screen px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 outline-none"
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-track" />
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="display text-[24px] leading-tight text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t('close')} className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-card text-ink">
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: ReactNode
  body: ReactNode
  confirmLabel: ReactNode
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation('common')
  return (
    <BottomSheet open={open} onClose={onCancel} title={title}>
      <div className="text-[16px] leading-relaxed text-ink-2">{body}</div>
      <div className="mt-5 space-y-2.5">
        <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </BottomSheet>
  )
}
