# Public HTTPS link to the demo on this laptop (run scripts/demo.ps1 or start-arth.ps1 first).
#
# - Once setup-named-tunnel.ps1 has run: the fixed address you chose (e.g. arth.example.in),
#   from ~/.cloudflared/arth.yml. Add it to Firebase Authorized domains once.
# - Otherwise: a random https://....trycloudflare.com address that changes every start;
#   add each one to Firebase -> Authentication -> Settings -> Authorized domains.
# - Without cloudflared: localhost.run over plain SSH (*.lhr.life, which some Indian
#   networks block by name).
#
# While it runs the laptop is kept awake (see keep-awake.ps1): the link only works while
# the laptop does. The tunnel reconnects on its own after a wake. Traffic passes through
# the tunnel provider; stop this (Ctrl+C, or stop-arth.ps1) when it isn't needed.
param([string]$LogFile)

Add-Type -Namespace Arth -Name Power -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
'@
$continuous = [uint32]2147483648  # ES_CONTINUOUS
[void][Arth.Power]::SetThreadExecutionState($continuous -bor [uint32]1)  # | ES_SYSTEM_REQUIRED

$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared -and (Test-Path "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe")) {
    $cloudflared = "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe"  # shells opened before the install
}
$named = Join-Path $env:USERPROFILE '.cloudflared\arth.yml'
$log = if ($LogFile) { @('--logfile', $LogFile) } else { @() }
try {
    if ($cloudflared -and (Test-Path $named)) {
        & $cloudflared tunnel --no-autoupdate --config $named @log run
    } elseif ($cloudflared) {
        & $cloudflared tunnel --no-autoupdate @log --url http://localhost:8000
    } else {
        ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes `
            -R 80:localhost:8000 nokey@localhost.run
    }
} finally {
    [void][Arth.Power]::SetThreadExecutionState($continuous)
}
