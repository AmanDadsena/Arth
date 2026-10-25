# Stops what start-arth.ps1 started: the public link (and its keep-awake) and the
# backend on port 8000. Ollama is left running; quit it from its tray icon if wanted.
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Get-CimInstance Win32_Process -Filter "Name = 'pwsh.exe' OR Name = 'powershell.exe'" |
    Where-Object { $_.CommandLine -like '*scripts\tunnel.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Write-Host 'Arth stopped (backend and public link). Sleep is allowed again.'
