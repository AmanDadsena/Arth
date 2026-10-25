# Stops Arth starting at sign-in (removes the shortcut install-autostart.ps1 made).
$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'Arth.lnk'
if (Test-Path $link) { Remove-Item $link; Write-Host "Removed $link" } else { Write-Host 'Arth was not set to start at sign-in.' }
