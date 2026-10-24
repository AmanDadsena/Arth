import type { FarmerProfile } from './api/types'

/**
 * Demo mode: no sign-in, no network. Every API call is answered in-process by
 * the mock resolver, so the demo survives a venue with no Wi-Fi.
 */
const KEY = 'arth.demo'

export const DEMO_FARMER: FarmerProfile = {
  name: 'Ramesh Patil',
  lang: 'mr',
  village: 'Niphad',
  district: 'Nashik',
  state: 'Maharashtra',
  lat: 20.08,
  lon: 74.11,
  crops: ['onion', 'grapes'],
  landAcres: 2.5,
  soilType: 'black',
  irrigation: 'drip',
  tankSizeLitres: 15,
  consentAt: '2026-10-01T06:30:00.000Z',
}

export function isDemo(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setDemo(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* storage blocked: demo simply lasts this page load */
  }
}
