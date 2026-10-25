# Starts everything for the demo and the public link, in the background:
#   1. waits for Ollama (the Ollama app starts itself at login; started here if not)
#   2. serves the built app + API on http://localhost:8000 (builds the app once if needed)
#   3. opens the public link and keeps the laptop awake while it runs (tunnel.ps1):
#      the fixed named tunnel once setup-named-tunnel.ps1 has run, else a random
#      trycloudflare.com address.
# The Startup-folder shortcut from install-autostart.ps1 runs this at login; it is also
# safe to run by hand (anything already running is left alone). Stop with stop-arth.ps1.
# Logs and the current public address: %LOCALAPPDATA%\Arth\logs
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $env:LOCALAPPDATA 'Arth\logs'
New-Item -ItemType Directory -Force $logs | Out-Null

# PowerShell 7 for the background window: Windows PowerShell 5.1 blocks scripts by
# default on this laptop, and changing that policy is not needed.
$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $pwsh) { throw 'PowerShell 7 is needed: winget install Microsoft.PowerShell' }

function Test-Url([string]$url) {
    try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
}

# 1. Ollama: give the Ollama app up to 2 minutes after login.
$ollama = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
for ($i = 0; -not (Test-Url 'http://127.0.0.1:11434/api/version'); $i++) {
    if ($i -eq 15 -and (Test-Path $ollama)) { Start-Process $ollama -ArgumentList 'serve' -WindowStyle Hidden }
    if ($i -ge 60) { throw 'Ollama did not start; open the Ollama app and run this again.' }
    Start-Sleep -Seconds 2
}

# 2. App + API on one address.
if (-not (Test-Url 'http://127.0.0.1:8000/api/health')) {
    if (-not (Test-Path (Join-Path $root 'frontend\dist\index.html'))) {
        Push-Location (Join-Path $root 'frontend')
        try { npm run build *> (Join-Path $logs 'build.log') } finally { Pop-Location }
    }
    $backend = Join-Path $root 'backend'
    Start-Process -FilePath (Join-Path $backend '.venv\Scripts\python.exe') -WorkingDirectory $backend -WindowStyle Hidden `
        -ArgumentList '-m', 'uvicorn', 'app.main:app_factory', '--factory', '--host', '127.0.0.1', '--port', '8000' `
        -RedirectStandardOutput (Join-Path $logs 'backend.out.log') -RedirectStandardError (Join-Path $logs 'backend.log')
    for ($i = 0; -not (Test-Url 'http://127.0.0.1:8000/api/health'); $i++) {
        if ($i -ge 30) { throw "The backend did not start; see $logs\backend.log" }
        Start-Sleep -Seconds 2
    }
}

# 3. Public link (also keeps the laptop awake while it runs).
if (-not (Get-Process cloudflared -ErrorAction SilentlyContinue)) {
    $tunnelLog = Join-Path $logs 'tunnel.log'
    Remove-Item $tunnelLog -ErrorAction SilentlyContinue
    Start-Process $pwsh -WindowStyle Hidden `
        -ArgumentList '-NoProfile', '-File', (Join-Path $PSScriptRoot 'tunnel.ps1'), '-LogFile', $tunnelLog
    # A random quick-tunnel address changes every start: write it down where it can be found.
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        if (-not (Test-Path $tunnelLog)) { continue }
        $url = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue |
            Select-Object -First 1 | ForEach-Object { $_.Matches[0].Value }
        if ($url) { Set-Content (Join-Path $logs 'public-url.txt') $url; break }
        if (Select-String -Path $tunnelLog -Pattern 'Registered tunnel connection' -Quiet -ErrorAction SilentlyContinue) {
            break  # named tunnel: its fixed address is in setup-named-tunnel.ps1's config
        }
    }
}
Write-Host "Arth is running: http://localhost:8000  (logs: $logs)"
