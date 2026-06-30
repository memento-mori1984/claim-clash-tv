# Launch the Claim Clash NSIS setup from a safe folder.
# Windows blocks NSIS when the setup.exe lives under C:\Windows\System32.
#
# Usage:
#   .\Run-Claim-Clash-Setup.ps1
#   .\Run-Claim-Clash-Setup.ps1 -Silent

param(
    [switch]$Silent
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$distDir = Join-Path $root "dist"
$setup = Get-ChildItem $distDir -File -Filter "Claim Clash * - Setup.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $setup) {
    Write-Error "No setup found in $distDir. Run .\scripts\build-nsis-installer.ps1 first."
}

$channels = & (Join-Path $root "scripts\resolve-alpha-channels.ps1")
$safeDir = $channels.ActiveClaimClashDir
New-Item -ItemType Directory -Path $safeDir -Force | Out-Null
$safeSetup = Join-Path $safeDir $setup.Name

Copy-Item $setup.FullName $safeSetup -Force
$sha = "$($setup.FullName).sha256"
if (Test-Path $sha) {
    Copy-Item $sha "$safeSetup.sha256" -Force
}

Write-Host "=== Claim Clash Setup ===" -ForegroundColor Cyan
Write-Host "Do NOT run the setup from dist\ under Windows\System32." -ForegroundColor Yellow
Write-Host "Using safe copy:" -ForegroundColor Green
Write-Host "  $safeSetup"
Write-Host ""

$args = if ($Silent) { "/S" } else { @() }
Start-Process -FilePath $safeSetup -ArgumentList $args -Wait

Write-Host ""
Write-Host "Install folder (typical): $env:LOCALAPPDATA\Claim Clash" -ForegroundColor DarkGray