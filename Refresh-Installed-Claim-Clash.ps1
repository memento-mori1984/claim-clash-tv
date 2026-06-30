# Copy the latest dist\ portable build into Start Menu install location.
# Use this after rebuilding — faster and more reliable than NSIS on this PC.
#
# Usage:
#   .\Refresh-Installed-Claim-Clash.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$dist = Join-Path $root "dist"
$installScript = Join-Path $root "scripts\install-claim-clash.ps1"

if (-not (Test-Path $installScript)) {
    Write-Error "Missing $installScript"
}

Write-Host "=== Refresh installed Claim Clash (portable) ===" -ForegroundColor Cyan
& $installScript -SourceDir $dist -DesktopShortcut
Write-Host ""
Write-Host "Start Menu shortcut now points at the latest dist build." -ForegroundColor Green