# Arth backend

FastAPI service for the Arth PWA. It implements every endpoint in [docs/SPEC.md](../docs/SPEC.md) §3
(the same paths and camelCase JSON as `frontend/src/lib/api/client.ts`). AI runs **locally** on
**Gemma 4 E4B through Ollama**, so photos, voice and documents never leave the machine.

## Run it

Requirements: Python 3.11–3.14, [Ollama](https://ollama.com), ~8 GB GPU recommended.

```bash
ollama pull gemma4:e4b
```

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows (Git Bash); on macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env          # then fill in ARTH_FIREBASE_PROJECT_ID (or ARTH_AUTH_DISABLED=true for local dev)
uvicorn app.main:app_factory --factory --port 8000
```

Point the frontend at it with `VITE_API_BASE_URL=http://localhost:8000/api` and `VITE_USE_MOCKS=false`
in `frontend/.env.local`. Interactive API docs: http://localhost:8000/docs (development only).

```bash
pytest          # 160 tests, no network or model needed
ruff check .    # lint + security rules
```

## How it works

```
React PWA ──HTTPS + Firebase ID token──▶ FastAPI
                                          ├─ auth.py        verify Google-signed JWT, uid from `sub` only
                                          ├─ middleware.py  rate limit, size cap, security headers
                                          ├─ media.py       sniff + re-encode images (EXIF/GPS dropped)
                                          ├─ stt.py         faster-whisper (CPU) speech → text
                                          ├─ llm.py ───────▶ Ollama · Gemma 4 E4B (local, JSON schema output)
                                          ├─ pii.py         Aadhaar (Verhoeff) / PAN / IFSC / account / phone / email
                                          ├─ services/      dose · schemes · calendar · weather · mandi · brief
                                          └─ db.py ────────▶ SQLite (AES-256-GCM sealed profiles)
                                   Open-Meteo (weather, geocoding) · data.gov.in Agmarknet (mandi prices)
```

**The model reads and explains; Python decides.** Gemma extracts fields from photos and voice as
schema-validated JSON. Doses (`services/dose.py`), scheme eligibility (`services/schemes.py`,
rules in `app/data/schemes.json`), spray advisories, crop suitability and sell decisions are
plain, unit-tested code. When a value is missing or confidence is below 0.6 the response sets
`escalate: true` and the app shows the Kisan Call Centre (1800-180-1551) instead of a guess.

| Endpoint | What runs |
|---|---|
| `GET/PUT/DELETE /farmer/me` | Encrypted profile; delete also wipes history |
| `GET /brief` | Weather + mandi + calendar rules → 2–3 actions (parallel, each source optional) |
| `GET /weather` | Open-Meteo 7-day forecast, cached 15 min, spray/heat advisories |
| `GET /mandi/prices` | Agmarknet prices, stored for the 30-day trend, distances from geocoding |
| `POST /mandi/sell-advice` | Net = price × qty − transport; Gemma only explains |
| `POST /ai/crop-doctor` | Gemma vision → diagnosis; low confidence escalates |
| `POST /ai/label-reader` | Gemma copies label values → Python computes the dose for your tank |
| `POST /ai/explain-document` | Gemma explains; every string PII-redacted; needs `consent=true` |
| `POST /ai/voice` | Whisper → redacted transcript → Gemma intent; routes/fields whitelisted |
| `GET /calendar`, `POST /schemes/match` | Rules over JSON data, no model |

## Security and privacy

- **Auth:** Firebase ID tokens verified per Firebase's spec: RS256 only (algorithm pinned),
  Google's rotating public keys (cached per `Cache-Control`, and on disk for offline use),
  `aud`/`iss` = your project, `exp`/`iat`/`auth_time` checked, `sub` 1–128 chars.
  The UID is never read from a body or query. `ARTH_AUTH_DISABLED` exists for local
  development only and the app refuses to start with it in production.
- **Storage:** profiles sealed with AES-256-GCM (row-bound with associated data); rows keyed by
  HMAC of the UID, never the UID itself; history holds redacted summaries only and expires after
  30 days; `DELETE /farmer/me` removes everything in one transaction.
- **Media:** never written to disk. Images are type-sniffed from bytes, size-capped,
  decompression-bomb guarded, re-encoded (drops EXIF/GPS and trailing payloads) and downscaled.
  Audio is type-sniffed, capped at 2 MB and 15 s, decoded in memory.
- **What the model sees:** the photo or a redacted transcript, crop, language and numbers.
  Never name, phone, UID or address. Model output is validated against a schema and redacted.
- **HTTP:** CORS allowlist (no cookies), token-bucket rate limit (10 rps, burst 20), body
  cap enforced on Content-Length *and* streamed bytes, `nosniff` / `DENY` / CSP / no-referrer
  headers, `Cache-Control: no-store` on personal data, one error shape that never echoes input,
  docs and OpenAPI disabled outside development.
- **Logs:** method, path, status and time only. No bodies, query strings, tokens or keys
  (`httpx` URL logging is silenced because the data.gov.in key is a query parameter).

## Google sign-in (Firebase)

Backend (this repo): set `ARTH_FIREBASE_PROJECT_ID`. No service account or secret is needed:
ID tokens are verified with Google's public keys.

Frontend (`frontend/`, owned by the frontend lead), when they wire it in:
1. Firebase console → create project → Authentication → Sign-in method → enable **Google**.
   Add `localhost` and the deployed domain under Authorized domains.
2. Project settings → Your apps → Web app → copy the config into `frontend/.env.local` as
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_APP_ID` (public by design, but keep `.env.local` out of git).
3. `npm i firebase`; in `AuthProvider`, sign in with `signInWithPopup(auth, new GoogleAuthProvider())`
   and register `registerTokenGetter(() => auth.currentUser?.getIdToken() ?? null)` from
   `src/lib/session.ts`. The SDK refreshes the one-hour token automatically.
4. Add `https://apis.google.com https://*.firebaseapp.com https://securetoken.googleapis.com
   https://identitytoolkit.googleapis.com` to the CSP in `security-headers.json`.

## Data sources and licenses

| Component | License |
|---|---|
| Gemma 4 E4B (Google DeepMind), via Ollama | Apache-2.0 (model), MIT (Ollama) |
| faster-whisper + Whisper weights | MIT |
| FastAPI, Pydantic, Uvicorn, PyJWT, Ruff, pytest | MIT |
| httpx, python-multipart | BSD-3-Clause / Apache-2.0 |
| cryptography | Apache-2.0 / BSD |
| Pillow | MIT-CMU (HPND) |
| SQLite | Public domain |
| Open-Meteo forecast + geocoding | Data CC BY 4.0, free non-commercial API |
| Agmarknet prices via data.gov.in | Government Open Data License – India (free API key) |

Scheme rules and crop calendar are simplified **demo data**: farmers should confirm on the
official portal or with the nearest KVK. Transport cost in sell advice is an estimate
(`ARTH_TRANSPORT_RS_PER_QUINTAL_KM`).

## Notes for the team

- The data.gov.in mandi resource (`9ef84268-…`) returns *today's* prices; the trend fills in as
  the backend runs each day. Field names follow the published dataset (`state, district,
  market, commodity, arrival_date dd/mm/yyyy, min_price, max_price, modal_price`). If your key
  returns no rows, check the filter names in `services/mandi.py::_refresh`.
- Swap the model with `ARTH_MODEL` (e.g. `gemma4:e2b` on smaller GPUs). `/api/health` reports
  whether it is loaded.
