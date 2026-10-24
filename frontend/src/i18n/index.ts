import { useCallback, useSyncExternalStore } from 'react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { Lang } from '@/lib/api/types'
import en from './locales/en.json'
import hi from './locales/hi.json'
import mr from './locales/mr.json'

/**
 * Three languages: Marathi (default — Nashik is Marathi-speaking), Hindi, English.
 * Each locale file's top-level keys are namespaces: `common` is shared, every
 * feature owns its own (`mandi`, `doctor`, …) — use useTranslation('<feature>').
 */

export const LANGS: { code: Lang; label: string; locale: string }[] = [
  { code: 'mr', label: 'मराठी', locale: 'mr-IN' },
  { code: 'hi', label: 'हिंदी', locale: 'hi-IN' },
  { code: 'en', label: 'English', locale: 'en-IN' },
]

export const LANG_KEY = 'arth.lang'

function initialLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY)
    if (v === 'en' || v === 'hi' || v === 'mr') return v
  } catch {
    /* storage blocked */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : ''
  if (nav.startsWith('hi')) return 'hi'
  if (nav.startsWith('en')) return 'en'
  return 'mr'
}

/**
 * Feature-owned strings live next to the feature, in
 * `src/features/<ns>/locales/{en,hi,mr}.json` (and `src/components/voice/locales/`).
 * Each file is the content of namespace <ns>, picked up here automatically, so
 * features never edit the shared locale files.
 */
type Bundle = Record<string, unknown>
const featureFiles = import.meta.glob<Bundle>(['../features/*/locales/*.json', '../components/*/locales/*.json'], { eager: true, import: 'default' })
const resources: Record<Lang, Record<string, Bundle>> = { en: { ...en }, hi: { ...hi }, mr: { ...mr } }
for (const [path, bundle] of Object.entries(featureFiles)) {
  const m = path.match(/\/(features|components)\/([^/]+)\/locales\/(en|hi|mr)\.json$/)
  if (!m) continue
  const ns = m[2]!
  const l = m[3] as Lang
  resources[l][ns] = { ...(resources[l][ns] ?? {}), ...bundle }
}

const NAMESPACES = Object.keys(resources.en)

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLang(),
  fallbackLng: 'en',
  ns: NAMESPACES,
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
})

function applyDocumentLang(l: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = l
}
applyDocumentLang(i18n.language)

export function setLang(l: Lang) {
  try {
    localStorage.setItem(LANG_KEY, l)
  } catch {
    /* storage blocked */
  }
  applyDocumentLang(l)
  void i18n.changeLanguage(l)
}

function subscribe(cb: () => void) {
  i18n.on('languageChanged', cb)
  return () => i18n.off('languageChanged', cb)
}

export function currentLang(): Lang {
  const l = i18n.language
  return l === 'en' || l === 'hi' || l === 'mr' ? l : 'mr'
}

/** Current language + setter; re-renders on change. */
export function useLang() {
  const lang = useSyncExternalStore(subscribe, currentLang, currentLang)
  const set = useCallback((l: Lang) => setLang(l), [])
  return { lang, setLang: set, locale: LANGS.find((x) => x.code === lang)!.locale }
}

/** ₹1,23,456 in Indian grouping, digits kept Latin for legibility. */
export function rupees(n: number) {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

/** '2026-10-24' → '24 Oct' / '24 ऑक्टो' */
export function fmtDate(isoDate: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  const d = new Date(isoDate.length === 10 ? isoDate + 'T00:00:00' : isoDate)
  const locale = LANGS.find((x) => x.code === lang)!.locale
  return new Intl.DateTimeFormat(locale, { ...opts, numberingSystem: 'latn' }).format(d)
}

export default i18n
