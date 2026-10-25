# One-time setup of the FIXED public address, e.g.:
#   .\scripts\setup-named-tunnel.ps1 -Hostname arth.example.in
# Needs a Cloudflare account with your domain added to it (see README, Demo mode).
#   1. `cloudflared tunnel login` opens the browser: sign in and pick the domain.
#      This saves ~/.cloudflared/cert.pem (keep it private, never commit it).
#   2. Creates the tunnel "arth" (credentials: ~/.cloudflared/<id>.json, also private).
#   3. Points <Hostname> at it (a DNS record in your Cloudflare zone).
#   4. Writes ~/.cloudflared/arth.yml, which tunnel.ps1 / start-arth.ps1 then use.
# Safe to run again: an existing tunnel and DNS record are reused.
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')]
    [string]$Hostname,
    [string]$Name = 'arth'
)
$ErrorActionPreference = 'Stop'
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) { $cf = "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe" }
if (-not (Test-Path $cf)) { throw 'cloudflared is not installed: winget install Cloudflare.cloudflared' }
$dir = Join-Path $env:USERPROFILE '.cloudflared'

if (-not (Test-Path (Join-Path $dir 'cert.pem'))) {
    & $cf tunnel login
    if ($LASTEXITCODE) { throw 'Cloudflare login did not finish.' }
}

$tunnel = & $cf tunnel list --output json | ConvertFrom-Json | Where-Object { $_.name -eq $Name } | Select-Object -First 1
if (-not $tunnel) {
    & $cf tunnel create $Name
    if ($LASTEXITCODE) { throw 'Could not create the tunnel.' }
    $tunnel = & $cf tunnel list --output json | ConvertFrom-Json | Where-Object { $_.name -eq $Name } | Select-Object -First 1
}

& $cf tunnel route dns --overwrite-dns $Name $Hostname
if ($LASTEXITCODE) { throw "Could not point $Hostname at the tunnel. Is the domain in this Cloudflare account?" }

@"
tunnel: $($tunnel.id)
credentials-file: $(Join-Path $dir "$($tunnel.id).json")
ingress:
  - hostname: $Hostname
    service: http://localhost:8000
  - service: http_status:404
"@ | Set-Content -Encoding utf8 (Join-Path $dir 'arth.yml')

Write-Host ""
Write-Host "Done. Fixed address: https://$Hostname"
Write-Host "Now add '$Hostname' in Firebase -> Authentication -> Settings -> Authorized domains,"
Write-Host "then restart the link: .\scripts\stop-arth.ps1 ; .\scripts\start-arth.ps1"
