# Arth: jury briefing (frontend first, whole system covered)

Plain English throughout. Every technical word is explained the first time it appears.
Read sections 1–4 out loud a few times; sections 5–12 are for when the jury digs in.

---

## 1. The 30-second pitch

> Arth (अर्थ) is a phone app for small farmers in Maharashtra. It answers one question:
> **"What should I do on my farm today?"** It combines the weather, mandi prices and the crop
> calendar into 2–3 jobs for today. It can look at a photo of a sick leaf, read a pesticide label
> and tell you exactly how much to put in your tank, explain a government document in plain
> Marathi, tell you whether to sell your onions now or wait, and find government schemes you
> qualify for. It speaks Marathi, Hindi and English, and you can use it by voice.
> When the AI is not sure, it does not guess. It gives you the Kisan Call Centre number.

## 2. The three ideas to repeat

1. **Built for the farmer, not for us.** Marathi first, big buttons (48 px), icons with words, voice
   everywhere, works on a cheap phone and with bad internet.
2. **The AI reads; plain code decides.** The AI (Gemma 4) looks at photos and listens to voice.
   Anything that could hurt a farmer (a pesticide dose, scheme eligibility, sell-or-wait) is
   calculated by normal, tested code. Low confidence → the app shows the helpline instead.
3. **Privacy by design.** Photos and voice are never stored. Location is rounded to about 1 km.
   Aadhaar, PAN, bank and phone numbers are blanked out. "Delete my data" removes everything.

## 3. What is built today (honest status)

| Part | Status |
|---|---|
| Frontend (all 12 screens, 3 languages, voice, offline) | Done, works fully in **demo mode** with no internet |
| Backend (teammate's PR #1, merged on GitHub) | Done: FastAPI + Gemma 4 running **locally** + Google sign-in, 176 tests |
| Live public data in the frontend (`lib/live`) | Done locally, **not committed yet** |
| Onboarding redesign, Profile sections, Calendar "Why now" | Done locally, **not committed yet** |
| Automated frontend tests | **Not yet** (type-check and lint pass) |

## 4. The journey of one farmer (use this as your demo script)

1. **Login** – dawn sky, hills, rising sun. Pick a language. "Sign in with Google" or "Try demo".
2. **Consent** – a plain list: what we store, what we never store. Nothing is saved before "Agree".
3. **Onboarding** – one question per screen: language, name, village, crops, land (required), then
   9 optional ones (soil, water, sprayer tank size, experience...). Review screen at the end.
4. **Home – "Aaj Ka Kaam"** – greeting, 4-day weather, 2–3 jobs sorted by priority, price chips,
   a **Listen** button that reads it all aloud.
5. **Crop Doctor** – take a photo of a leaf → disease, how sure the AI is, organic treatment first.
6. **Label Reader** – photo of a pesticide bottle → dose **for your 15 L tank**. Blurry photo → no
   number, only the helpline. (Demo trick: a file named `blur...` shows this.)
7. **Kagaz Samjho** – photo of a 7/12 extract or bank notice → summary, deadlines with "days left",
   next steps, and chips showing what was blanked out (Aadhaar, phone...).
8. **Mandi** – nearby market prices, 30-day chart, and **Sell Smart**: enter quantity → "Sell now"
   or "Wait", with money earned after transport for each market.
9. **Calendar** – season picked from the month, best crops for your soil, week-by-week plan,
   "Why now" (weather, market, news reasons).
10. **Schemes** – 8 simple questions → which schemes you qualify for and why → an application form
    you can **fill by speaking**.
11. **Voice button** (always there) – say "show onion prices" → it answers aloud and opens the page.
12. **Profile** – edit farm, language, alerts, download my data, sign out, **delete my data**.

---

## 5. The tech stack and why we picked each piece

| Tool | What it is | Why we use it |
|---|---|---|
| **React 19** | The UI library | Industry standard, huge ecosystem |
| **TypeScript (strict)** | JavaScript with types | Catches mistakes before the app runs. We share one type file with the backend, so both sides agree on the data |
| **Vite 8** | Build tool and dev server | Very fast start and rebuild |
| **Tailwind CSS v4** | Styling with small class names | Colours and fonts are defined once as "tokens", copied from our sister project **Rutu** |
| **React Router 7** | Moves between screens | Nested layouts and "guards" (who may see which screen) |
| **TanStack Query 5** | Fetches and caches server data | Loading, errors, retries and caching for free |
| **react-i18next** | Translations | 3 languages, each feature has its own translation files |
| **vite-plugin-pwa (Workbox)** | Makes it an installable app with offline support | Farmers have patchy internet |
| **Recharts** | Charts | The 30-day price chart, loaded only when needed |
| **MSW** | Fake API in development | Build and demo the frontend before the backend existed |
| **browser-image-compression** | Shrinks photos on the phone | Faster upload on 2G/3G, and it removes GPS data from photos |
| **Firebase Auth** (added by PR #1) | Google sign-in | Free, secure, farmers already have Google accounts on Android |

**PWA** = Progressive Web App: a website that installs on the home screen like an app and works
offline. No Play Store needed, one codebase, small size.

## 6. How the code is organised

```
frontend/src/
  main.tsx          starts the app
  app/              router, page layout (phone frame), bottom nav, mic button slot
  lib/api/          types.ts (the data contract), client.ts (talks to the server), queries.ts (caching)
  lib/session.ts    where the login token plugs in
  lib/firebase.ts   Google sign-in, loaded only when used  (PR #1)
  lib/demo.ts       demo mode
  lib/live/         free public data: Open-Meteo weather, data.gov.in mandi prices
  components/ui/    our design system: buttons, cards, chips, icons, sheets, loading/error states
  components/voice/ recording, mic button, read-aloud
  features/<name>/  one folder per screen, with its own en/hi/mr translations
  mocks/            fake answers for every API call (demo mode)
  i18n/             translation setup
```

**Key idea: "feature folders".** Each screen lives in its own folder and owns its own text.
Shared code is only the design system (`components/ui`) and the API layer (`lib/api`). This let
several people (and agents) build screens in parallel without touching each other's files.

Size: about 8,700 lines of TypeScript across ~120 files.

## 7. How the app starts and moves between screens

- **`main.tsx`** creates the app once, wraps it in a **crash screen** (an "error boundary": if
  anything breaks, the farmer sees a friendly message in Marathi/Hindi/English, not a white page),
  then the data cache, then the router.
- **Lazy loading:** every screen except Login is downloaded only when opened. The first load is
  small. The offline cache still stores all screens.
- **`ProtectedRoute` (the guard):**
  not signed in → Login. Signed in but no profile → Consent → Onboarding. Otherwise → the screen.
  It also switches the app to the farmer's saved language.
- **`Layout`:** on a laptop the app is shown inside a phone frame (good for the jury). On a phone it
  fills the screen. The bottom nav shows on the 5 main tabs: Home, Doctor, Mandi, Calendar,
  Profile. The mic button sits on the right end of the nav.

## 8. How the frontend talks to the backend

- **One contract.** `lib/api/types.ts` describes every request and response. The backend (PR #1)
  uses exactly the same names and shapes (`docs/SPEC.md` §3). This is why both could be built
  in parallel.
- **One function sends everything** (`client.ts`):
  - attaches the login token (`Authorization: Bearer <token>`);
  - gives up after **20 s for AI** calls and 15 s for others;
  - turns every failure into one error type, which knows if a retry makes sense;
  - if the server says **401** (token expired or invalid), the farmer is signed out safely;
  - photos and audio go as `multipart/form-data` (the normal file-upload format).
- **Caching** (`queries.ts`): data is "fresh" for 5 minutes. Failed requests retry twice, but never
  on errors like "not found" or "not allowed" (no point). After the profile is saved, all other
  data is refreshed, because weather and prices depend on the village.
- **Demo mode:** the same function answers from fake data inside the browser, with no internet.
  A service worker can't be trusted on venue Wi-Fi, so demo mode never needs one.

## 9. Login and accounts (updated by PR #1)

- We designed a **"seam"**: one place (`lib/session.ts`) where any login system can register a
  function that returns a token. Screens never know who is logged in or how.
- PR #1 plugged **Firebase Google sign-in** into that seam. Not a single screen had to change.
  This proves the design.
- How it works:
  - Firebase is downloaded **only when sign-in is used** (it adds ~2 kB to the first load).
  - Sign-in opens a Google popup. Firebase gives a token that lasts 1 hour and refreshes itself.
  - Sign-out also signs out of Firebase and clears the cache and the phone's storage (keeps only
    the language).
  - **Delete my data:** first deletes everything on the server (needs the token), then deletes
    the Google account link in Firebase, then signs out.
  - Sign-in is switched on only when the 4 Firebase settings are present. Without them, only demo
    mode is offered.
  - A developer-only shortcut (`VITE_DEV_SIGN_IN`) exists for local testing. It is ignored in real
    builds, and the backend refuses to run that way in production.
- The backend checks every token itself (correct algorithm, issuer, audience, expiry), and takes the
  user ID **only from the verified token**, never from what the app sends.

## 10. Each screen, technically (the "how")

**Login** – sky is a CSS gradient; hills are 3 layered SVG shapes; the sun rises with CSS
animation; the tagline changes language every 3.2 s. If the phone has "reduce motion" turned on,
everything stays still (accessibility). Google button follows Google's brand rules.

**Consent** – nothing is stored before "Agree". The time of agreement (`consentAt`) is saved with
the profile.

**Onboarding** – the questions are **data, not code**: `model.ts` lists 14 questions (5 required,
9 optional) and the screen just draws them. Single-choice answers move on by themselves after a
short moment. Location uses the phone's GPS at low accuracy, rounded to 2 decimals (~1 km), then
matched to the nearest district; or the farmer picks a district. The same flow is reused for
editing from Profile. Each step slides in and moves keyboard focus to the title (accessibility).

**Home ("Aaj Ka Kaam")** – one request gets the whole brief. Up to 3 jobs, sorted by priority.
Each job has a button that opens the right screen. "Listen" reads it aloud.

**Weather** – current weather, warnings sorted by severity, 7-day list with rain bars.
Rules: rain > 60% → "don't spray"; wind > 20 km/h → "don't spray"; above 38 °C → "water in the
evening".

**Mandi** – two tabs: Prices and Sell Smart. Your own crops come first. Links can open a tab
directly (e.g. from a Home job). The chart library loads only when this screen opens. Sell Smart
keeps its answer when you switch tabs. After 2 failures it shows the helpline.

**Crop Doctor / Label Reader / Kagaz** – they share one set of building blocks (`doctor/vision.tsx`):
1. Photo is shrunk to max 1024 px and re-saved as JPEG on the phone. This makes upload fast **and
   removes hidden GPS data** from the photo.
2. The answer is **not kept** after you leave the screen (`gcTime: 0`, privacy).
3. Confidence: ≥ 0.8 "sure", ≥ 0.6 "fairly sure", **below 0.6 → no advice, helpline instead**.
4. Label Reader shows a dose **only if it is printed on the label** and confidence is good. The
   tank size comes from the profile (5–30 L). **We never guess a dose.**
5. Kagaz shows deadlines with days left and which personal numbers were blanked out.
6. Every AI result carries a small "Analyzed by Gemma 4" tag.

**Calendar** – season from the month (Jun–Sep kharif, Oct–Feb rabi, Mar–May zaid), farmer can
change it. Crops sorted by suitability. Tap one → week-by-week plan opens in place. "Why now" lists
weather, market and dated news reasons.

**Schemes** – 8 yes/no style questions, land and irrigation pre-filled from the profile. Results
say eligible or not, and **why**. The application form can be **filled by voice**: the AI returns
field values, which are marked "please check" until the farmer confirms each one. Nothing is
submitted from our app; it links to the official website.

**Profile** – completeness ring, farm details, optional questions, alert switches, online/offline
indicator, **Download my data** (a JSON file built on the phone), share the app, sign out,
**Delete my data** (with a confirm step).

## 11. Voice

- **Recording** (`useVoice`): asks for the mic with echo and noise reduction, records up to
  **15 seconds**, ignores clips shorter than 0.6 s. Picks an audio format the phone supports.
  Sends the audio plus "which screen am I on, which form fields exist" to `POST /ai/voice`.
- **Safe navigation:** if the AI says "open /mandi", we only accept in-app paths. Anything like
  `//evil.com` is rejected (this stops "open redirect" attacks).
- **No race bugs:** each recording gets a number; a late answer from an old recording is ignored.
  The mic is released right away; audio is never saved.
- **Read aloud** uses the phone's built-in voice (`speechSynthesis`). Marathi falls back to a Hindi
  voice (same Devanagari script). Long text is split into sentences because Chrome cuts long
  speech. Only one "Listen" plays at a time.
- **Backend side (PR #1):** Gemma 4 itself turns speech into text, the text is cleaned of personal
  numbers, then Gemma decides the intent. Allowed screens and form fields are a fixed list.

## 12. Languages

- Marathi is the default, then the farmer's saved choice, then the phone's language.
- Every feature folder has `locales/en.json`, `hi.json`, `mr.json`, **loaded automatically**. No
  team ever edits another team's file.
- `<html lang>` changes with the language, so fonts and screen readers behave correctly.
- Rupees use Indian grouping (₹1,23,456). Numbers stay in Latin digits for readability.
- Fonts (Tiro Devanagari, Anek Devanagari, Inter) are **stored inside the app**, only the
  characters we need. They work offline and make no calls to Google Fonts.

## 13. Offline and speed

- **Service worker** (a small script the browser keeps running in the background):
  - the app's files are saved on first visit, so it opens with no internet;
  - weather, prices, brief and profile: try the network for 6 s, else use the saved copy (3 days);
  - **AI calls are never saved** (privacy rule);
  - fonts saved for a year.
- **Live public data** (`lib/live`, uncommitted): weather from **Open-Meteo** (free, no key), mandi
  prices from **data.gov.in Agmarknet** (government data). Order: fresh saved copy → network (6 s)
  → old saved copy → built-in sample data. **The screen is never empty.** The government feed has
  no history, so the app saves one price per day on the phone to draw the trend. Dates use Indian
  time, not UTC.
- **Speed:** screens load on demand, the chart library loads on demand, fake data only loads in demo
  mode, photo shrinking runs in a background thread (web worker), font files are cut to size.

## 14. Security and privacy (expect questions here)

**In the frontend**
- Strict **security headers** on every host: CSP (the browser may only run our own scripts and talk
  to our server, Firebase and Google), no embedding in other sites (stops clickjacking), camera,
  mic and location allowed only for our own page, HTTPS forced. `npm run preview` sends the same
  headers so problems show up locally.
- Location rounded to ~1 km. Photos re-saved without GPS data. AI answers not kept in memory after
  leaving the screen. Audio only in memory.
- Sign-out and 401 clear everything stored on the phone except the language.
- No secrets in the frontend. The Firebase settings are public by design (Google says so).

**In the backend (PR #1)**
- Every token checked properly; user ID only from the verified token.
- Aadhaar (checked with its Verhoeff checksum), PAN, IFSC, bank account, phone and email are blanked
  out of everything returned, logged or stored.
- Profiles encrypted with **AES-256-GCM**; the database never stores the raw user ID (only a
  keyed hash). History is deleted after 30 days.
- Photos and audio are never written to disk.
- Rate limiting, upload size limits, allowed-origins list (CORS), logs without personal data.

## 15. The backend in one breath (PR #1, by our teammate)

> FastAPI (Python) server with the same API as the frontend contract. AI is **Gemma 4 E2B running
> locally through Ollama**, so photos, voice and documents never leave our machine. Gemma only reads
> and explains, and must answer in a fixed JSON shape. Doses, scheme eligibility, weather warnings,
> crop suitability and sell decisions are normal Python code with tests. Live weather from
> Open-Meteo, mandi prices from Agmarknet. SQLite database with encrypted profiles. 176 automated
> tests. The frontend only changed for login: Firebase Google sign-in, and `npm run dev` forwards
> `/api` to the local backend so the browser sees one address.

Note: `docs/SPEC.md` says "Gemma via the Gemini API". The team chose **local Gemma** instead, for
privacy and so it runs without internet. Say this confidently; it is a deliberate choice.

## 16. Likely jury questions and short answers

**Why a PWA and not an Android app?** One codebase, no Play Store install, small size, works offline,
updates itself. Farmers can add it to the home screen.

**Why TanStack Query and not Redux?** Almost all our data comes from the server. Query handles
caching, retries and refresh for us. Screen-only state stays in normal React state.

**How does it work offline?** Saved app files + saved API answers + saved live data + built-in sample
data. Demo mode needs no internet at all.

**What if the AI is wrong?** Below 60% confidence we show the Kisan Call Centre (1800-180-1551)
instead of advice. A dose is shown only if it is printed on the label, and the multiplication is
done by code, not the AI. Organic treatment is shown first.

**How do you protect farmer data?** Consent first, nothing stored before. Photos/voice never stored,
location ~1 km, ID numbers blanked, encrypted profile, 30-day history, one-tap delete.

**How did login plug in so easily?** We built a seam (`lib/session.ts`) from day one. Firebase
registered its token there; no screen changed.

**How do 3 languages scale across a team?** Each feature has its own translation files, loaded
automatically. Nobody edits a shared file.

**How do frontend and backend stay in sync?** One written contract (`docs/SPEC.md` §3, `types.ts`).
Same paths, same field names.

**Accessibility?** 48 px buttons, icons with text, screen-reader labels, keyboard support,
"reduce motion" respected, voice input and read-aloud for farmers who read little.

**Performance on a cheap phone?** Lazy screens, lazy charts, compressed photos, small fonts, data
cached on the phone.

**Testing?** Frontend: strict type-check and lint pass, plus manual end-to-end runs. Backend: 176
automated tests. Honest gap: **no automated frontend tests yet**; next step is Vitest + Testing
Library.

**Why is the AI local and not in the cloud?** Privacy (documents and photos stay on our machine),
works without internet, no per-call cost. The trade-off is a smaller model, so we keep all
safety-critical logic in code.

## 16b. "How accurate is it?" (honest answer, part by part)

Short version: **we did not invent any data.** Weather and prices come from trusted public
sources, so we are as accurate as they are. Rules (dose, schemes, sell, advisories) are exact
code. The one part with uncertain accuracy is the AI, and that is why it escalates when unsure.
We have **not measured a percentage accuracy** for anything; don't quote one.

| Part | Source | How accurate | Known limits |
|---|---|---|---|
| Weather | Open-Meteo (blends national weather models, e.g. ECMWF, GFS) | Good for 1–3 days, weaker by day 7. Grid is ~1–11 km | Village rounded to ~1 km (fine). Rain probability is a forecast, not a promise. Refreshed every 15 min |
| Spray/heat advisories | Our fixed rules: rain >60%, wind >20 km/h, heat >38 °C | Exact, given the forecast | Only as good as the forecast. Thresholds are general guidance, not crop-specific |
| Mandi prices | data.gov.in Agmarknet (Govt. of India) | Official prices reported by APMCs | Reported with a delay of a day or more; some markets skip days. "Modal" = most common price, not your exact price |
| Market distance | Market name → Open-Meteo geocoder → straight line × 1.3 | Rough | When a market's name isn't found, the district centre is used, so several markets show the same km (e.g. 44.9 km) |
| Price trend / Sell Smart | Prices the backend has saved each day | Arithmetic is exact | The trend **builds up from the day the server starts**. A fresh server has 1 point, so the advice is always "Sell now". Transport cost is a flat ₹2/quintal/km estimate. Tomato and grapes are always "sell now" (they spoil) |
| Crop calendar | `crops.json`, general Maharashtra guidance | Typical windows | Not district-specific; the file itself says "confirm with your nearest KVK" |
| Schemes | `schemes.json`, simplified public rules | Correct for the rules written | Simplified; real eligibility has more conditions. The app says verify on the official portal |
| Pesticide dose | Printed label dose × your tank size, by code | Exact if the label was read right | No dose if the label is unclear or confidence is low |
| Crop Doctor / Label / Kagaz / Voice | Gemma 4 E2B, a small model on our machine | **Not measured.** Live tests worked on sample photos | Small model, so it can be wrong. Below 0.6 confidence → Kisan Call Centre. Dose maths never done by the AI |
| "Why now" news (calendar) | Real dated articles, but **hand-picked sample data** in the frontend | Real links | Not a live news feed; the backend doesn't provide it yet |

If asked "how would you measure AI accuracy?": collect labelled photos (e.g. the public
PlantVillage disease dataset plus photos from Nashik farms checked by a KVK expert), run them
through the app, and report how often it is right, and how often it correctly says "not sure".

## 17. Weak spots (know them before they ask)

1. No automated frontend tests yet.
2. Read-aloud code is copied in 4 places (`brief`, `mandi`, `doctor` `useSpeech` +
   `components/voice/speech.ts`); should be one module.
3. Scheme application form does not submit anywhere (by design: links to the official site).
4. Google sign-in works but was not confirmed end-to-end from the backend log; live mandi prices on
   the backend need a data.gov.in key.
5. A lot of frontend work is still uncommitted (onboarding redesign, profile sections, `lib/live`,
   calendar "Why now", mocks), and 2 local commits are not pushed.
6. Merging PR #1 undid our small fix that writes the demo farmer's name in the chosen script
   ("रमेश पाटील" in Marathi). In demo mode the name may show in English inside Marathi text.
