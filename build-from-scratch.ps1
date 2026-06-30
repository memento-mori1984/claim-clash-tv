# Claim Clash - Clean rebuild from scratch (no version bump, portable exe only)
# Copyright (c) 2026 Zachary H. Roberts. All rights reserved.
#
# Usage (from project root):
#   .\build-from-scratch.ps1
#   .\build-from-scratch.ps1 -SkipPackage
#
# Runs cargo clean, syncs version metadata without incrementing, builds portable release
# and beta-dev Dev exe together (--no-bundle, skips NSIS), then repackages the Drive zip.

param(
    [switch]$SkipPackage
)

$ErrorActionPreference = "Stop"

Write-Host "=== Claim Clash Build From Scratch ===" -ForegroundColor Cyan

if (-not (Test-Path (Join-Path $PSScriptRoot "package.json"))) {
    Write-Error "Run this script from the claim-clash-tv project root."
}

& (Join-Path $PSScriptRoot "build-with-checksum.ps1") -Clean -NoIncrement -PortableOnly

if (-not $SkipPackage) {
    Write-Host "`nRepackaging tester Drive zip..." -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot "scripts\package-drive-zip.ps1")
}

Write-Host "`n=== Scratch Build Complete ===" -ForegroundColor Green