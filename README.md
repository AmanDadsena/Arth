# Arth — अर्थ

Daily farming decisions for small farmers in Maharashtra — in Marathi, Hindi and English.

- **Aaj Ka Kaam** — today's 2–3 most important jobs from weather, mandi prices and the crop calendar
- **Crop Doctor** — photo of a leaf → disease, organic and chemical treatment
- **Label Reader** — photo of a pesticide label → dose for *your* tank (never guessed)
- **Kagaz Samjho** — photo of a government or bank letter → plain-language summary, private info hidden
- **Mandi + Sell Smart** — nearby prices, 30-day trend, best market after transport
- **Crop Calendar** and **Scheme Finder**
- **Voice** — ask in Marathi, Hindi or English

AI runs on **Gemma 4** (vision, native audio, function calling). Photos and voice are processed in
memory and never stored. See [docs/SPEC.md](docs/SPEC.md) for the API contract and privacy rules.

## Run the frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:5173 and tap **Try demo without signing in** — the demo runs fully offline on
sample data for Ramesh, an onion and grape farmer from Niphad, Nashik.

```bash
npm run build   # type-check + production build
npm run lint
```

## Repo layout

| Path | What |
|---|---|
| `frontend/` | Vite + React + TypeScript PWA |
| `backend/` | FastAPI on AWS Lambda (SAM) |
| `docs/SPEC.md` | API contract, ownership, security rules |

Design system ported from [Rutu](https://github.com/rushii23-dev/Project-Rutu).

## License

See [LICENSE](LICENSE).
