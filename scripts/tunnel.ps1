# Temporary public HTTPS link to the demo on this laptop (run scripts/demo.ps1 first).
# It prints a https://... address. Add that host to Firebase -> Authentication ->
# Settings -> Authorized domains, or Google sign-in fails there. The address changes
# every time this restarts. Traffic passes through the tunnel provider; stop this
# (Ctrl+C) when the demo ends.
#
# Prefers Cloudflare's free quick tunnel (*.trycloudflare.com, needs cloudflared:
# winget install Cloudflare.cloudflared). Otherwise localhost.run over plain SSH
# (*.lhr.life, nothing to install), which some Indian networks block by name.
if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    cloudflared tunnel --no-autoupdate --url http://localhost:8000
} else {
    ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes `
        -R 80:localhost:8000 nokey@localhost.run
}
