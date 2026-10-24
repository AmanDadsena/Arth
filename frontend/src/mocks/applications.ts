import type { Application, ApplicationInput, ApplicationStatus, Lang, SchemeAnswers } from '@/lib/api/types'
import { isDemo } from '@/lib/demo'
import { matchSchemes } from './data'

/**
 * Demo/mock side of the scheme application tracker (GET/PUT/DELETE /applications),
 * kept in this browser's storage. Mirrors backend/app/services/applications.py:
 * same statuses, same next-step rules and wording, same refusal of personal ID
 * numbers as a reference.
 */

const KEY = () => (isDemo() ? 'arth.demo.applications' : 'arth.mock.applications')

type Stored = ApplicationInput & { schemeId: string; createdAt: string; updatedAt: string }

const NEXT: Record<'docs' | 'apply' | Exclude<ApplicationStatus, 'preparing'>, Record<Lang, string>> = {
  docs: { en: 'Get the {n} remaining documents ready', hi: 'बाकी {n} दस्तावेज़ तैयार करें', mr: 'उरलेली {n} कागदपत्रे तयार करा' },
  apply: {
    en: 'All documents ready. Apply on the official website or at your nearest CSC',
    hi: 'सारे दस्तावेज़ तैयार हैं। आधिकारिक वेबसाइट पर या नज़दीकी CSC पर आवेदन करें',
    mr: 'सर्व कागदपत्रे तयार आहेत. अधिकृत वेबसाइटवर किंवा जवळच्या CSC मध्ये अर्ज करा',
  },
  applied: {
    en: 'Keep your reference number safe and check the status on the official website',
    hi: 'अपना संदर्भ नंबर संभालकर रखें और आधिकारिक वेबसाइट पर स्थिति देखें',
    mr: 'तुमचा संदर्भ क्रमांक जपून ठेवा आणि अधिकृत वेबसाइटवर स्थिती तपासा',
  },
  approved: { en: 'Approved. Check your bank passbook for the benefit', hi: 'मंज़ूर हुआ। लाभ के लिए अपनी बैंक पासबुक देखें', mr: 'मंजूर झाले. लाभासाठी तुमचे बँक पासबुक तपासा' },
  rejected: {
    en: 'Ask at your nearest CSC or agriculture office why, and apply again if you are eligible',
    hi: 'नज़दीकी CSC या कृषि कार्यालय में कारण पूछें, और पात्र हों तो फिर से आवेदन करें',
    mr: 'जवळच्या CSC किंवा कृषी कार्यालयात कारण विचारा, आणि पात्र असल्यास पुन्हा अर्ज करा',
  },
}

// every scheme, whatever the answers: we only need names, documents and links here
const ALL: SchemeAnswers = { ownsLand: true, landAcres: 2, category: 'general', hasBankAccount: true, hasAadhaar: true, isWoman: false, irrigation: 'rainfed', incomeTaxPayer: false }

// Aadhaar-like 12 digits, PAN, Indian mobile: the same kinds the server refuses
const PERSONAL_ID = /(?<!\d)[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?!\d)|\b[A-Z]{5}\d{4}[A-Z]\b|(?<!\d)[6-9]\d{9}(?!\d)/

function read(): Stored[] {
  try {
    return JSON.parse(localStorage.getItem(KEY()) ?? '[]') as Stored[]
  } catch {
    return []
  }
}

function write(list: Stored[]) {
  try {
    localStorage.setItem(KEY(), JSON.stringify(list))
  } catch {
    /* storage blocked: lasts this page load */
  }
}

function view(s: Stored, lang: Lang): Application | null {
  const scheme = matchSchemes(ALL, lang).schemes.find((x) => x.id === s.schemeId)
  if (!scheme) return null
  const docsReady = s.docsReady ?? []
  const missing = scheme.documents.length - docsReady.length
  const nextStep = s.status === 'preparing' ? (missing > 0 ? NEXT.docs[lang].replace('{n}', String(missing)) : NEXT.apply[lang]) : NEXT[s.status][lang]
  return {
    schemeId: s.schemeId,
    name: scheme.name,
    officialUrl: scheme.officialUrl,
    status: s.status,
    documents: scheme.documents,
    docsReady,
    appliedOn: s.appliedOn ?? null,
    referenceNo: s.referenceNo ?? null,
    lastDate: s.lastDate ?? null,
    note: s.note ?? null,
    nextStep,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }
}

const open = (a: Application) => a.status === 'preparing' || a.status === 'applied'

/** Answers /applications routes; null for any other path. */
export function resolveApplications(method: string, path: string, lang: Lang, body: unknown): { status: number; body: unknown } | null {
  if (path !== '/applications' && !path.startsWith('/applications/')) return null
  const list = read()
  if (method === 'GET' && path === '/applications') {
    const apps = list.map((s) => view(s, lang)).filter((a): a is Application => !!a)
    apps.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    apps.sort((a, b) => Number(!open(a)) - Number(!open(b)) || (a.lastDate ?? '9999').localeCompare(b.lastDate ?? '9999'))
    return { status: 200, body: { applications: apps } }
  }
  const id = decodeURIComponent(path.slice('/applications/'.length))
  if (method === 'DELETE') {
    if (!list.some((s) => s.schemeId === id)) return { status: 404, body: { error: { code: 'not_found', message: 'Not tracked' } } }
    write(list.filter((s) => s.schemeId !== id))
    return { status: 200, body: { deleted: true } }
  }
  if (method === 'PUT') {
    const input = (body ?? {}) as ApplicationInput
    if (input.referenceNo && PERSONAL_ID.test(input.referenceNo)) {
      return { status: 400, body: { error: { code: 'reference_is_personal_id', message: 'That looks like a personal ID number. Enter the application or reference number instead.' } } }
    }
    const now = new Date().toISOString()
    const prev = list.find((s) => s.schemeId === id)
    const next: Stored = { ...input, docsReady: [...new Set(input.docsReady ?? [])].sort((a, b) => a - b), schemeId: id, createdAt: prev?.createdAt ?? now, updatedAt: now }
    const app = view(next, lang)
    if (!app) return { status: 404, body: { error: { code: 'unknown_scheme', message: 'Unknown scheme' } } }
    write([...list.filter((s) => s.schemeId !== id), next])
    return { status: 200, body: app }
  }
  return { status: 405, body: { error: { code: 'method_not_allowed', message: 'Method not allowed' } } }
}
