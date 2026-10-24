# Demo mode: build the web app, then serve the app and the API from one address,
# http://localhost:8000 (one origin: no CORS, and the offline service worker works).
# Needs: Ollama running with gemma4:e2b, backend/.env and frontend/.env.local filled in.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Push-Location (Join-Path $root 'frontend')
try { npm run build } finally { Pop-Location }

Set-Location (Join-Path $root 'backend')
& .\.venv\Scripts\python.exe -m uvicorn app.main:app_factory --factory --host 127.0.0.1 --port 8000
