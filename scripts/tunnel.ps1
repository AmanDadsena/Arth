# Temporary public HTTPS link to the demo on this laptop (run scripts/demo.ps1 first).
# It prints a https://... address. Add that host to Firebase -> Authentication ->
# Settings -> Authorized domains, or Google sign-in fails there. The address changes
# every time this restarts. Traffic passes through the tunnel provider; stop this
# (Ctrl+C) when the demo ends.
#
# While it runs the laptop is kept awake (see keep-awake.ps1): the link only works
# while the laptop does. The tunnel itself reconnects on its own after a wake.
#
# Prefers Cloudflare's free quick tunnel (*.trycloudflare.com, needs cloudflared:
# winget install Cloudflare.cloudflared). Otherwise localhost.run over plain SSH
# (*.lhr.life, nothing to install), which some Indian networks block by name.
Add-Type -Namespace Arth -Name Power -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
'@
$continuous = [uint32]2147483648  # ES_CONTINUOUS
[void][Arth.Power]::SetThreadExecutionState($continuous -bor [uint32]1)  # | ES_SYSTEM_REQUIRED

$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared -and (Test-Path "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe")) {
    $cloudflared = "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe"  # shells opened before the install
}
try {
    if ($cloudflared) {
        & $cloudflared tunnel --no-autoupdate --url http://localhost:8000
    } else {
        ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes `
            -R 80:localhost:8000 nokey@localhost.run
    }
} finally {
    [void][Arth.Power]::SetThreadExecutionState($continuous)
}
