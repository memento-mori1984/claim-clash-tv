# Claim Clash - Build + Checksum Helper (Windows PowerShell)
# Copyright (c) 2026 Zachary H. Roberts. All rights reserved.
# "Claim Clash" is a trademark of Zachary H. Roberts.
#
# Usage:
#   .\build-with-checksum.ps1
#
# This script:
#   1. Bumps iteration and syncs version metadata
#   2. Runs `npm run tauri build`
#   3. Saves the portable exe and a .sha256 file in `dist/`
#   4. Removes outdated Claim Clash builds from `dist/` and ClaimClash/
#
# IMPORTANT: This is for convenience. The official way to get the app is still "clone + build yourself".

$ErrorActionPreference = "Stop"

Write-Host "=== Claim Clash Build + Checksum ===" -ForegroundColor Cyan

# Ensure we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Error "Run this script from the claim-clash-tv project root."
    exit 1
}

# Bump iteration and sync version across package.json, Tauri config, Cargo.toml, and UI
Write-Host "`nSyncing iteration-based version..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "scripts\sync-version.ps1") -Increment

# Run the Tauri build
Write-Host "`nRunning Tauri build..." -ForegroundColor Yellow
npm run tauri build

# Note: Tauri build may return non-zero if the NSIS bundler fails (common on some Windows setups),
# but the portable exe is usually still produced. We proceed if the exe exists.
$builtExe = "src-tauri\target\release\claim-clash-tv.exe"

if (-not (Test-Path $builtExe)) {
    Write-Error "Tauri build failed and no executable was produced at $builtExe"
    exit 1
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Tauri build reported an error (often NSIS installer bundling), but the portable exe exists." -ForegroundColor Yellow
}

# Create output folder
$outputDir = "dist"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

# Copy the exe with version and release-phase in the filename (e.g. Claim Clash 0.1.19 Alpha.exe)
$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$verMeta = Get-Content "version.json" -Raw | ConvertFrom-Json
$version = $pkg.version
$phase = if ($verMeta.phase) { $verMeta.phase.Trim() } else { "" }
$finalName = if ($phase) { "Claim Clash $version $phase.exe" } else { "Claim Clash $version.exe" }
$finalPath = Join-Path $outputDir $finalName

Copy-Item $builtExe $finalPath -Force

# Generate checksum
$hash = Get-FileHash -Algorithm SHA256 $finalPath
$checksumPath = "$finalPath.sha256"
"$($hash.Hash)  $finalName" | Out-File -Encoding UTF8 -FilePath $checksumPath

Write-Host "`nCleaning up outdated build artifacts..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "scripts\clean-old-builds.ps1")

Write-Host "`n=== Build Complete ===" -ForegroundColor Green
Write-Host "Portable exe:     $finalPath"
Write-Host "SHA-256 checksum: $checksumPath"
Write-Host ""
Write-Host "To verify on another machine:"
Write-Host "  Get-FileHash -Algorithm SHA256 '$finalName' | Select Hash"
Write-Host "Compare the hash against the .sha256 file."
Write-Host ""
Write-Host "Remember: The safest way is still to clone the repo and build yourself." -ForegroundColor Yellow
