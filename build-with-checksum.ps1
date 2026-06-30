# Claim Clash - Build + Checksum Helper (Windows PowerShell)
# Copyright (c) 2026 Zachary H. Roberts. All rights reserved.
#
# Usage:
#   .\build-with-checksum.ps1
#   .\build-with-checksum.ps1 -Clean -NoIncrement -PortableOnly
#   .\build-from-scratch.ps1
#
# Always updates BOTH outputs together (unless -SkipDev):
#   - dist\Claim Clash [version] [phase].exe          (Release, no embedded keys)
#   - ClaimClash\beta-dev\Claim Clash [version] Dev.exe (pre-filled tester keys)

param(
    [switch]$Clean,
    [switch]$NoIncrement,
    [switch]$PortableOnly,
    [switch]$SkipDev
)

$ErrorActionPreference = "Stop"

Write-Host "=== Claim Clash Build + Checksum ===" -ForegroundColor Cyan

if (-not (Test-Path "package.json")) {
    Write-Error "Run this script from the claim-clash-tv project root."
    exit 1
}

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

function Test-IsSystem32Path([string]$Path) {
    if (-not $Path) { return $false }
    $normalized = [System.IO.Path]::GetFullPath($Path).TrimEnd('\').ToLowerInvariant()
    return $normalized -eq 'c:\windows\system32' -or $normalized -like 'c:\windows\system32\*'
}

$projectRoot = (Get-Location).Path
$useNsisStaging = (-not $PortableOnly) -and (Test-IsSystem32Path $projectRoot)

$releaseParams = @{
    SkipVersionSync = $false
    PortableOnly    = [bool]$PortableOnly
    SkipDev         = [bool]$SkipDev
}
if ($NoIncrement) {
    & (Join-Path $PSScriptRoot "scripts\sync-version.ps1")
    $releaseParams.SkipVersionSync = $true
} else {
    $releaseParams.Increment = $true
}

if ($useNsisStaging) {
    Write-Host "`nNSIS cannot bundle inside Windows\System32; using staging build..." -ForegroundColor Yellow
    $nsisArgs = @()
    if ($NoIncrement) { $nsisArgs += "-NoIncrement" }
    if ($Clean) { $nsisArgs += "-Clean" }
    if ($SkipDev) { $nsisArgs += "-SkipDev" }
    & (Join-Path $PSScriptRoot "scripts\build-nsis-installer.ps1") @nsisArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    & (Join-Path $PSScriptRoot "scripts\build-release.ps1") @releaseParams
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ""
Write-Host "To verify on another machine:"
Write-Host "  Get-FileHash -Algorithm SHA256 '<exe name>' | Select Hash"
Write-Host "Compare the hash against the matching .sha256 file."
Write-Host ""
Write-Host "Remember: The safest way is still to clone the repo and build yourself." -ForegroundColor Yellow