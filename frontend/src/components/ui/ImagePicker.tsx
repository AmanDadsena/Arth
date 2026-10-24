import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import imageCompression from 'browser-image-compression'
import { Icon } from './Icon'

/**
 * Camera + gallery picker. Every image is compressed to at most 1024 px on its
 * long side (JPEG) before it is handed over, so uploads stay small on 2G and
 * well under the 5 MB server limit. EXIF (incl. GPS) is dropped by the re-encode.
 */

export interface PickedImage {
  file: File
  previewUrl: string
}

export const MAX_IMAGE_PX = 1024

export async function compressImage(file: File): Promise<File> {
  const out = await imageCompression(file, {
    maxWidthOrHeight: MAX_IMAGE_PX,
    maxSizeMB: 0.8,
    fileType: 'image/jpeg',
    initialQuality: 0.85,
    useWebWorker: true,
  })
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([out], name, { type: 'image/jpeg' })
}

export function ImagePicker({
  value,
  onChange,
  label,
  hint,
}: {
  value: PickedImage | null
  onChange: (img: PickedImage | null) => void
  label?: string
  hint?: string
}) {
  const { t } = useTranslation('common')
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  // release the object URL when the preview changes or unmounts
  useEffect(() => () => (value ? URL.revokeObjectURL(value.previewUrl) : undefined), [value])

  async function handle(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setBusy(true)
    setFailed(false)
    try {
      const file = await compressImage(f)
      onChange({ file, previewUrl: URL.createObjectURL(file) })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
      if (camRef.current) camRef.current.value = ''
      if (galRef.current) galRef.current.value = ''
    }
  }

  const inputs = (
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handle(e.target.files)} />
      <input ref={galRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handle(e.target.files)} />
    </>
  )

  if (value) {
    return (
      <div className="overflow-hidden rounded-[28px] bg-card">
        {inputs}
        <img src={value.previewUrl} alt={t('image.preview')} className="max-h-[320px] w-full object-cover" />
        <div className="flex gap-2 p-3">
          <button type="button" onClick={() => camRef.current?.click()} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-3xl bg-chip text-[15px] font-semibold text-ink-2">
            <Icon name="camera" size={20} />
            {t('image.retake')}
          </button>
          <button type="button" onClick={() => onChange(null)} className="flex h-12 w-12 items-center justify-center rounded-3xl bg-chip text-ink-2" aria-label={t('image.remove')}>
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[28px] border-2 border-dashed border-track bg-card/60 p-5">
      {inputs}
      {label ? <div className="text-center text-[17px] font-semibold text-ink">{label}</div> : null}
      {hint ? <div className="mt-1 text-center text-[14px] text-muted">{hint}</div> : null}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => camRef.current?.click()}
          className="flex h-[96px] flex-col items-center justify-center gap-1.5 rounded-[24px] bg-grow text-white active:brightness-90"
        >
          <Icon name="camera" size={28} />
          <span className="text-[16px] font-semibold">{t('image.camera')}</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => galRef.current?.click()}
          className="flex h-[96px] flex-col items-center justify-center gap-1.5 rounded-[24px] bg-card text-ink active:bg-chip"
        >
          <Icon name="gallery" size={28} />
          <span className="text-[16px] font-semibold">{t('image.gallery')}</span>
        </button>
      </div>
      {busy ? <div className="mt-3 text-center text-[14px] text-muted">{t('image.preparing')}</div> : null}
      {failed ? <div className="mt-3 text-center text-[14px] font-semibold text-warn-d">{t('image.failed')}</div> : null}
    </div>
  )
}
