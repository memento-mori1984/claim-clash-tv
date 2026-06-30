# Claim Clash - Release build (no embedded API keys)
#
# Usage:
#   .\scripts\build-release.ps1
#   .\scripts\build-release.ps1 -Increment

param(
    [switch]$Increment,
    [switch]$SkipVersionSync
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path "package.json")) {
    Write-Error "Run this script from the claim-clash-tv project root."
}

Write-Host "=== Claim Clash Release Build (no embedded keys) ===" -ForegroundColor Cyan

& (Join-Path $PSScriptRoot "set-build-profile.ps1") -Profile Release

if (-not $SkipVersionSync) {
    if ($Increment) {
        & (Join-Path $PSScriptRoot "sync-version.ps1") -Increment
    } else {
        & (Join-Path $PSScriptRoot "sync-version.ps1")
    }
}

Write-Host "`nRunning Tauri build..." -ForegroundColor Yellow
npm run tauri build

$builtExe = "src-tauri\target\release\claim-clash-tv.exe"
if (-not (Test-Path $builtExe)) {
    Write-Error "Tauri build failed and no executable was produced at $builtExe"
}

$outputDir = "dist"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$verMeta = Get-Content "version.json" -Raw | ConvertFrom-Json
$version = $pkg.version
$phase = if ($verMeta.phase) { $verMeta.phase.Trim() } else { "" }
$finalName = if ($phase) { "Claim Clash $version $phase.exe" } else { "Claim Clash $version.exe" }
$finalPath = Join-Path $outputDir $finalName

Copy-Item $builtExe $finalPath -Force
$hash = Get-FileHash -Algorithm SHA256 $finalPath
"$($hash.Hash)  $finalName" | Out-File -Encoding UTF8 -FilePath "$finalPath.sha256"

Write-Host "`nCleaning up outdated build artifacts..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "clean-old-builds.ps1") -Target Release

Write-Host "`nRelease build complete (no embedded API keys):" -ForegroundColor Green
Write-Host "  $finalPath"