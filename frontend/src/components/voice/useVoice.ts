import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLang } from '@/i18n'
import { api, ApiError } from '@/lib/api/client'
import type { VoiceResponse } from '@/lib/api/types'

/**
 * useVoice — record one spoken question and send it to POST /ai/voice.
 *
 * ```ts
 * const { state, start, stop, result, error, reset } = useVoice({ screen: 'schemes', formFields: ['name', 'village'] })
 * ```
 *
 * Options (both optional, read at the moment the recording is sent, so they may change freely):
 *   screen      – context for the model, e.g. 'home', 'mandi', 'schemes'. Default 'home'.
 *   formFields  – names of the form fields on screen. When given, the reply may come back with
 *                 `intent: 'fill_form'` and `result.slots` = { fieldName: value } for you to apply.
 *
 * Returns:
 *   state   – 'idle'       nothing happening (also after a successful answer: check `result`)
 *             'recording'  mic is open; ends on stop() or automatically after 15 s
 *             'processing' audio sent, waiting for the answer
 *             'error'      something failed; `error` has a message to show
 *             'denied'     mic permission refused, or the browser cannot record at all
 *   start() – asks for the mic (first time) and starts recording. Clears the previous result.
 *             Ignored while recording/processing.
 *   stop()  – stops recording and sends the audio. Ignored unless recording.
 *   result  – the VoiceResponse of the last successful request, else null.
 *   error   – a short, already-translated message for the farmer (current language), else null.
 *   reset() – cancels everything (discards an in-progress recording or ignores a pending answer)
 *             and returns to 'idle' with result/error cleared.
 *
 * Privacy: audio is held only in memory for the single request and never stored; the mic
 * tracks are released as soon as recording stops (and on unmount). Max length is 15 s.
 *
 * `isVoiceSupported()` (exported) tells you up front whether recording can work at all.
 * The hook does not speak the reply — use speak(result.reply, lang) from './speech'.
 */

export type VoiceState = 'idle' | 'recording' | 'processing' | 'error' | 'denied'

export interface UseVoiceOptions {
  screen?: string
  formFields?: string[]
}

export interface UseVoiceResult {
  state: VoiceState
  start(): void
  stop(): void
  result: VoiceResponse | null
  error: string | null
  reset(): void
}

export const MAX_RECORDING_MS = 15_000
const MIN_RECORDING_MS = 600
const MIN_BLOB_BYTES = 800

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

/** True when this browser can record audio (getUserMedia + MediaRecorder). */
export function isVoiceSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof window.MediaRecorder !== 'undefined'
  )
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined
  return MIME_CANDIDATES.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m)
    } catch {
      return false
    }
  })
}

type ErrorKey = 'denied' | 'unsupported' | 'noMic' | 'tooShort' | 'offline' | 'timeout' | 'failed'

function errorKeyFor(err: unknown): ErrorKey {
  if (err instanceof ApiError) {
    if (err.code === 'network') return 'offline'
    if (err.code === 'timeout' || err.status === 408) return 'timeout'
  }
  return 'failed'
}

export function useVoice(opts: UseVoiceOptions = {}): UseVoiceResult {
  const { t } = useTranslation('voice')
  const { lang } = useLang()

  const [state, setState] = useState<VoiceState>('idle')
  const [result, setResult] = useState<VoiceResponse | null>(null)
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null)

  // latest options/lang, read when the recording is sent
  const ctxRef = useRef({ lang, screen: opts.screen, formFields: opts.formFields })
  useEffect(() => {
    ctxRef.current = { lang, screen: opts.screen, formFields: opts.formFields }
  })

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedAtRef = useRef(0)
  /** bumps on every start/reset/unmount; async work from an older session is dropped */
  const sessionRef = useRef(0)
  /** a start() is waiting for getUserMedia */
  const pendingRef = useRef(false)
  /** stop() was pressed while getUserMedia was still pending */
  const stopEarlyRef = useRef(false)
  const busyRef = useRef(false)

  const release = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
  }, [])

  const fail = useCallback((key: ErrorKey) => {
    busyRef.current = false
    setErrorKey(key)
    setState(key === 'denied' || key === 'unsupported' ? 'denied' : 'error')
  }, [])

  const send = useCallback(
    async (blob: Blob, session: number) => {
      setState('processing')
      const { lang: l, screen, formFields } = ctxRef.current
      try {
        const res = await api.voice(blob, l, { screen: screen || 'home', ...(formFields?.length ? { formFields } : {}) })
        if (session !== sessionRef.current) return
        busyRef.current = false
        setResult(res)
        setState('idle')
      } catch (err) {
        if (session !== sessionRef.current) return
        fail(errorKeyFor(err))
      }
    },
    [fail],
  )

  const stop = useCallback(() => {
    if (pendingRef.current) {
      stopEarlyRef.current = true
      return
    }
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop()
      } catch {
        release()
      }
    }
  }, [release])

  const start = useCallback(() => {
    if (busyRef.current || pendingRef.current) return
    if (!isVoiceSupported()) {
      fail('unsupported')
      return
    }
    const session = ++sessionRef.current
    busyRef.current = true
    pendingRef.current = true
    stopEarlyRef.current = false
    setResult(null)
    setErrorKey(null)

    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((stream) => {
        if (session === sessionRef.current) pendingRef.current = false
        if (session !== sessionRef.current || stopEarlyRef.current) {
          stream.getTracks().forEach((tr) => tr.stop())
          if (session === sessionRef.current) {
            busyRef.current = false
            setState('idle')
          }
          return
        }
        streamRef.current = stream

        let rec: MediaRecorder
        try {
          const mimeType = pickMimeType()
          rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
        } catch {
          release()
          fail('unsupported')
          return
        }
        recorderRef.current = rec
        chunksRef.current = []

        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
        }
        rec.onerror = () => {
          release()
          chunksRef.current = []
          recorderRef.current = null
          if (session === sessionRef.current) fail('failed')
        }
        rec.onstop = () => {
          const elapsed = Date.now() - startedAtRef.current
          const type = rec.mimeType || chunksRef.current[0]?.type || 'audio/webm'
          const blob = new Blob(chunksRef.current, { type })
          chunksRef.current = []
          recorderRef.current = null
          release()
          if (session !== sessionRef.current) return
          if (elapsed < MIN_RECORDING_MS || blob.size < MIN_BLOB_BYTES) {
            fail('tooShort')
            return
          }
          void send(blob, session)
        }

        try {
          rec.start()
        } catch {
          release()
          recorderRef.current = null
          fail('failed')
          return
        }
        startedAtRef.current = Date.now()
        timerRef.current = setTimeout(() => {
          if (rec.state !== 'inactive') rec.stop()
        }, MAX_RECORDING_MS)
        setState('recording')
      })
      .catch((err: unknown) => {
        if (session !== sessionRef.current) return
        pendingRef.current = false
        const name = err instanceof DOMException ? err.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') fail('denied')
        else if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'OverconstrainedError') fail('noMic')
        else if (name === 'NotSupportedError' || name === 'TypeError') fail('unsupported')
        else fail('failed')
      })
  }, [fail, release, send])

  const reset = useCallback(() => {
    sessionRef.current++
    stopEarlyRef.current = true
    pendingRef.current = false
    busyRef.current = false
    const rec = recorderRef.current
    recorderRef.current = null
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop()
      } catch {
        /* already stopped */
      }
    }
    chunksRef.current = []
    release()
    setResult(null)
    setErrorKey(null)
    setState('idle')
  }, [release])

  // unmount: drop any pending answer and free the mic
  useEffect(
    () => () => {
      sessionRef.current++
      stopEarlyRef.current = true
      const rec = recorderRef.current
      recorderRef.current = null
      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop()
        } catch {
          /* ignore */
        }
      }
      chunksRef.current = []
      release()
    },
    [release],
  )

  return { state, start, stop, result, error: errorKey ? t(`errors.${errorKey}`) : null, reset }
}
