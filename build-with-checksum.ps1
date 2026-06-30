# Claim Clash - Build + Checksum Helper (Windows PowerShell)
# Copyright (c) 2026 Zachary H. Roberts. All rights reserved.
# "Claim Clash" is a trademark of Zachary H. Roberts.
#
# Usage:
#   .\build-with-checksum.ps1
#   .\build-with-checksum.ps1 -Clean -NoIncrement -PortableOnly
#   .\build-from-scratch.ps1
#
# This script:
#   1. Bumps iteration and syncs version metadata (unless -NoIncrement)
#   2. Runs `npm run tauri build` (portable-only with -PortableOnly)
#   3. Saves the portable exe and a .sha256 file in `dist/`
#   4. Removes outdated Claim Clash builds from `dist/` and ClaimClash/
#
# IMPORTANT: This is for convenience. The official way to get the app is still "clone + build yourself".

param(
    [switch]$Clean,
    [switch]$NoIncrement,
    [switch]$PortableOnly
)

$ErrorActionPreference = "Stop"

Write-Host "=== Claim Clash Build + Checksum ===" -ForegroundColor Cyan

# Ensure we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Error "Run this script from the claim-clash-tv project root."
    exit 1
}

# Alpha tester builds include pre-filled keys (never use this script for Store/public release).
Write-Host "`nSetting Alpha build profile (embedded tester keys)..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "scripts\set-build-profile.ps1") -Profile Alpha

if ($Clean) {
    Write-Host "`nCleaning Rust target (full rebuild from scratch)..." -ForegroundColor Yellow
    Push-Location (Join-Path $PSScriptRoot "src-tauri")
    try {
        cargo clean
        if ($LASTEXITCODE -ne 0) {
            Write-Error "cargo clean failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
    $nsisScratch = Join-Path $PSScriptRoot "src-tauri\target\release\nsis"
    if (Test-Path $nsisScratch) {
        Remove-Item $nsisScratch -Recurse -Force
        Write-Host "Removed stale NSIS scratch: $nsisScratch" -ForegroundColor DarkGray
    }
}

# Sync version across package.json, Tauri config, Cargo.toml, and UI
Write-Host "`nSyncing iteration-based version..." -ForegroundColor Yellow
if ($NoIncrement) {
    & (Join-Path $PSScriptRoot "scripts\sync-version.ps1")
} else {
    & (Join-Path $PSScriptRoot "scripts\sync-version.ps1") -Increment
}

function Test-IsSystem32Path([string]$Path) {
    if (-not $Path) { return $false }
    $normalized = [System.IO.Path]::GetFullPath($Path).TrimEnd('\').ToLowerInvariant()
    return $normalized -eq 'c:\windows\system32' -or $normalized -like 'c:\windows\system32\*'
}

$projectRoot = (Get-Location).Path
$useNsisStaging = (-not $PortableOnly) -and (Test-IsSystem32Path $projectRoot)

if ($useNsisStaging) {
    Write-Host "`nNSIS cannot bundle inside Windows\System32; using staging build..." -ForegroundColor Yellow
    $nsisArgs = @()
    if ($NoIncrement) { $nsisArgs += "-NoIncrement" }
    if ($Clean) { $nsisArgs += "-Clean" }
    & (Join-Path $PSScriptRoot "scripts\build-nsis-installer.ps1") @nsisArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
    $verMeta = Get-Content "version.json" -Raw | ConvertFrom-Json
    $version = $pkg.version
    $phase = if ($verMeta.phase) { $verMeta.phase.Trim() } else { "" }
    $finalName = if ($phase) { "Claim Clash $version $phase.exe" } else { "Claim Clash $version.exe" }
    $setupName = if ($phase) { "Claim Clash $version $phase - Setup.exe" } else { "Claim Clash $version - Setup.exe" }
    $finalPath = Join-Path "dist" $finalName
    $setupPath = Join-Path "dist" $setupName

    Write-Host "`n=== Build Complete ===" -ForegroundColor Green
    Write-Host "Portable exe:     $finalPath"
    Write-Host "SHA-256 checksum: $finalPath.sha256"
    Write-Host "NSIS setup:       $setupPath"
    Write-Host "Setup checksum:   $setupPath.sha256"
} else {
    # Run the Tauri build locally
    if ($PortableOnly) {
        Write-Host "`nRunning Tauri build (portable exe only, no NSIS bundle)..." -ForegroundColor Yellow
        npm run tauri build -- --no-bundle
    } else {
        Write-Host "`nRunning Tauri build..." -ForegroundColor Yellow
        npm run tauri build
    }

    $builtExe = "src-tauri\target\release\claim-clash-tv.exe"

    if (-not (Test-Path $builtExe)) {
        Write-Error "Tauri build failed and no executable was produced at $builtExe"
        exit 1
    }

    if ($LASTEXITCODE -ne 0) {
        if ($PortableOnly) {
            Write-Error "Tauri build failed with exit code $LASTEXITCODE"
        }
        Write-Host "Warning: Tauri build reported an error (often NSIS installer bundling), but the portable exe exists." -ForegroundColor Yellow
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
    $checksumPath = "$finalPath.sha256"
    "$($hash.Hash)  $finalName" | Out-File -Encoding UTF8 -FilePath $checksumPath
    $verifyHash = (Get-FileHash -Algorithm SHA256 $finalPath).Hash
    if ($verifyHash -ne $hash.Hash) {
        Write-Error "Checksum verification failed for $finalPath"
    }

    if (-not $PortableOnly) {
        $stagingSetup = Get-ChildItem "src-tauri\target\release\bundle\nsis" -Filter "*-setup.exe" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($stagingSetup) {
            $setupName = if ($phase) { "Claim Clash $version $phase - Setup.exe" } else { "Claim Clash $version - Setup.exe" }
            $setupPath = Join-Path $outputDir $setupName
            Copy-Item $stagingSetup.FullName $setupPath -Force
            $setupHash = Get-FileHash -Algorithm SHA256 $setupPath
            "$($setupHash.Hash)  $setupName" | Out-File -Encoding UTF8 -FilePath "$setupPath.sha256"
        }
    }

    $changeLogs = Join-Path $PSScriptRoot "CHANGE LOGS.txt"
    if (Test-Path $changeLogs) {
        Copy-Item $changeLogs (Join-Path $outputDir "CHANGE LOGS.txt") -Force
        $logsText = Get-Content $changeLogs -Raw
        $packagedLabel = if ($phase) { "$version $phase" } else { $version }
        if ($logsText -match '(?m)^Current packaged build in dist:.*$') {
            $logsText = $logsText -replace '(?m)^Current packaged build in dist:.*$', "Current packaged build in dist: $packagedLabel"
            $utf8 = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($changeLogs, $logsText, $utf8)
            Copy-Item $changeLogs (Join-Path $outputDir "CHANGE LOGS.txt") -Force
        }
    }

    Write-Host "`nCleaning up outdated build artifacts..." -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot "scripts\clean-old-builds.ps1")

    Write-Host "`n=== Build Complete ===" -ForegroundColor Green
    Write-Host "Portable exe:     $finalPath"
    Write-Host "SHA-256 checksum: $checksumPath"
    if (-not $PortableOnly -and $stagingSetup) {
        Write-Host "NSIS setup:       $setupPath"
        Write-Host "Setup checksum:   $setupPath.sha256"
    }
}
Write-Host ""
Write-Host "To verify on another machine:"
Write-Host "  Get-FileHash -Algorithm SHA256 '$finalName' | Select Hash"
Write-Host "Compare the hash against the .sha256 file."
Write-Host ""
Write-Host "Remember: The safest way is still to clone the repo and build yourself." -ForegroundColor Yellow
