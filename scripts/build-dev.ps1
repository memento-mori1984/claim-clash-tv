# Claim Clash - Developer testing build (pre-filled API keys -> beta-dev folder)
#
# Usage:
#   .\scripts\build-dev.ps1
#   .\scripts\build-dev.ps1 -NoIncrement
#   .\scripts\build-dev.ps1 -SkipVersionSync

param(
    [switch]$NoIncrement,
    [switch]$SkipVersionSync,
    [string]$ClaimClashDir = "C:\Users\Ranzh\ClaimClash"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path "package.json")) {
    Write-Error "Run this script from the claim-clash-tv project root."
}

Write-Host "=== Claim Clash Dev Build (beta-dev, embedded tester keys) ===" -ForegroundColor Cyan

& (Join-Path $PSScriptRoot "set-build-profile.ps1") -Profile Dev

if (-not $SkipVersionSync) {
    if ($NoIncrement) {
        & (Join-Path $PSScriptRoot "sync-version.ps1")
    } else {
        & (Join-Path $PSScriptRoot "sync-version.ps1") -Increment
    }
}

Write-Host "`nRunning Tauri build..." -ForegroundColor Yellow
npm run tauri build -- --no-bundle

$builtExe = "src-tauri\target\release\claim-clash-tv.exe"
if (-not (Test-Path $builtExe)) {
    Write-Error "Tauri build failed and no executable was produced at $builtExe"
}

$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$verMeta = Get-Content "version.json" -Raw | ConvertFrom-Json
$version = $pkg.version
$phase = if ($verMeta.phase) { $verMeta.phase.Trim() } else { "" }
$finalName = if ($phase) { "Claim Clash $version $phase Dev.exe" } else { "Claim Clash $version Dev.exe" }

$devDir = Join-Path $ClaimClashDir "beta-dev"
New-Item -ItemType Directory -Path $devDir -Force | Out-Null

$finalPath = Join-Path $devDir $finalName
Copy-Item $builtExe $finalPath -Force
$hash = Get-FileHash -Algorithm SHA256 $finalPath
"$($hash.Hash)  $finalName" | Out-File -Encoding UTF8 -FilePath "$finalPath.sha256"

$readme = @"
Claim Clash developer testing build
===================================
Version: $version $(if ($phase) { $phase } else { '' }) (Dev profile)

- Pre-filled API keys for your convenience (from scripts/alpha-keys.local.json)
- Keeps your saved settings when you switch between Dev and Release builds
- Launch this exe from beta-dev for day-to-day testing

Main release build (no embedded keys) lives in claim-clash-tv\dist\
Install that build with scripts\install-claim-clash.ps1 -SourceDir dist
"@
$readme | Out-File -Encoding UTF8 -FilePath (Join-Path $devDir "DEV-BUILD.txt")

$changeLogs = Join-Path (Split-Path $PSScriptRoot -Parent) "CHANGE LOGS.txt"
if (Test-Path $changeLogs) {
    Copy-Item $changeLogs (Join-Path $devDir "CHANGE LOGS.txt") -Force
}

Write-Host "`nCleaning up outdated beta-dev artifacts..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "clean-old-builds.ps1") -Target Dev -ClaimClashDir $ClaimClashDir

Write-Host "`nDev build complete:" -ForegroundColor Green
Write-Host "  $finalPath"