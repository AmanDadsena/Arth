# Arth Frontend PWA

> **Mobile-first Progressive Web App built with React 19, TypeScript (strict), Tailwind CSS v4 and Vite.**

[![React](https://img.shields.io/badge/React-19.3-61dafb.svg?logo=react&logoColor=black)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0_Strict-blue.svg?logo=typescript&logoColor=white)](package.json)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38bdf8.svg?logo=tailwindcss&logoColor=white)](package.json)
[![Vite](https://img.shields.io/badge/Vite-8.3-646cff.svg?logo=vite&logoColor=white)](vite.config.ts)
[![i18n](https://img.shields.io/badge/Languages-Marathi_%7C_Hindi_%7C_English-brightgreen.svg)](src/i18n/)

Built for smallholder farmers in Maharashtra: 360–414 px phones first, 48 px tap targets, icons
with words, voice everywhere, works offline once seen. Design tokens, type and cards come from
[Project Rutu](https://github.com/rushii23-dev/Project-Rutu).

**Google sign-in is the only way in, and every screen is served by the backend with live data.**
There is no demo mode and no mock API.

---

## Screens

| Route | Screen | Notes |
| :--- | :--- | :--- |
| `/login` | Sign-in | Dawn hills, cycling tagline, **Sign in with Google**, trust chips, privacy notice |
| `/consent` | Privacy consent | What is kept, what never is |
| `/onboarding` | 6 questions | Language, name, place (GPS or district), crops, land, water. Soil is **found** from the place and shown, never asked |
| `/` | Home — Aaj Ka Kaam | `TodayHero` (live sky, weather now, season progress), the top job, crops in the field today, 4-day weather, price alerts, tools |
| `/calendar` | Crop calendar | `YearMap`, crops in the field now, "sow now" with days left, "coming up", monsoon-onset card, week-by-week plans |
| `/doctor` `/label` `/kagaz` | Gemma 4 tools | Crop Doctor, Label Reader (dose for your tank), document explainer |
| `/mandi` | Prices & Sell Smart | Nearby markets, 30-day trend, sell now or wait |
| `/schemes` | Scheme finder | One question per screen, voice-filled application |
| `/weather` | 7-day weather | Spray / heat / wind advisories |
| `/profile` | Profile | Hero, my farm (soil marked as from the district), `SoilCard`, shortcuts, Settings row |
| `/settings` | Settings | Language & alerts, farm details (tank, soil correction), about you, help, privacy & data, about, sign out |

---

## Run

```bash
npm install
cp .env.example .env.local   # the four VITE_FIREBASE_* values from your Firebase web app
npm run dev                  # http://localhost:5173, /api proxied to the backend on :8000
```

Start the backend first (see [`../backend/README.md`](../backend/README.md)). Set
`ARTH_API_PROXY` to point the dev proxy at another backend address.

| Variable | Purpose |
| :--- | :--- |
| `VITE_API_BASE_URL` | API base; empty = `/api` (proxied in dev) |
| `VITE_FIREBASE_API_KEY` `VITE_FIREBASE_AUTH_DOMAIN` `VITE_FIREBASE_PROJECT_ID` `VITE_FIREBASE_APP_ID` | Google sign-in (public by design). Required |

## Check

```bash
npm run lint
npm run build    # tsc -b + vite build
```

## Where things live

```
src/
├── app/                 router, Layout (phone frame on wide screens), BottomNav, MicSlot
├── components/ui/       shared primitives (Card, Button, BottomSheet, states, icons)
├── components/voice/    mic button, speech helpers
├── features/<feature>/  one folder per screen, with its own locales/{en,hi,mr}.json
├── lib/api/             typed client (types.ts mirrors backend/app/schemas.py), TanStack Query hooks
├── lib/firebase.ts      Firebase Auth, loaded on first use
└── i18n/                shared strings and the namespace loader
```
