# Keeps this laptop awake (the screen may still turn off) until you press Ctrl+C or
# close this window. A sleeping laptop serves nothing, so the public link fails.
# Uses the same Windows request a video player makes: no setting is changed, and it
# ends with this window. Closing the lid still sleeps unless Windows is set otherwise.
Add-Type -Namespace Arth -Name Power -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
'@
$continuous = [uint32]2147483648  # ES_CONTINUOUS
$system = [uint32]1               # ES_SYSTEM_REQUIRED
[void][Arth.Power]::SetThreadExecutionState($continuous -bor $system)
Write-Host 'Keeping the laptop awake for the Arth demo. Press Ctrl+C to stop.'
try {
    while ($true) { Start-Sleep -Seconds 60 }
} finally {
    [void][Arth.Power]::SetThreadExecutionState($continuous)
    Write-Host 'Sleep allowed again.'
}
