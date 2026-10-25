# Starts Arth automatically when you sign in to Windows: adds a shortcut to YOUR Startup
# folder (no admin, no system setting) that runs start-arth.ps1 hidden. Ollama already
# starts itself the same way. Undo with uninstall-autostart.ps1.
$startup = [Environment]::GetFolderPath('Startup')
$link = Join-Path $startup 'Arth.lnk'
$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($link)
# PowerShell 7: Windows PowerShell 5.1 blocks scripts by default, and that policy stays as is.
$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $pwsh) { throw 'PowerShell 7 is needed: winget install Microsoft.PowerShell' }
$s.TargetPath = $pwsh
$s.Arguments = "-NoProfile -WindowStyle Hidden -File `"$(Join-Path $PSScriptRoot 'start-arth.ps1')`""
$s.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$s.WindowStyle = 7  # minimized
$s.Description = 'Start Arth (backend + public link) at sign-in'
$s.Save()
Write-Host "Arth will start at sign-in: $link"
