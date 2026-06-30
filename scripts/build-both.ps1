# Claim Clash - Build main release (dist) and developer testing build (beta-dev)
#
# Usage:
#   .\scripts\build-both.ps1
#   .\scripts\build-both.ps1 -NoIncrement

param(
    [switch]$NoIncrement
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path "package.json")) {
    Write-Error "Run this script from the claim-clash-tv project root."
}

Write-Host "=== Claim Clash: Release + Dev builds ===" -ForegroundColor Cyan

if ($NoIncrement) {
    & (Join-Path $PSScriptRoot "sync-version.ps1")
} else {
    & (Join-Path $PSScriptRoot "sync-version.ps1") -Increment
}

$releaseParams = @{ SkipVersionSync = $true }
$devParams = @{ SkipVersionSync = $true }

& (Join-Path $PSScriptRoot "build-release.ps1") @releaseParams
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& (Join-Path $PSScriptRoot "build-dev.ps1") @devParams
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nBoth builds complete." -ForegroundColor Green
Write-Host "  Main (release): dist\"
Write-Host "  Dev (testing):  C:\Users\Ranzh\ClaimClash\beta-dev\"