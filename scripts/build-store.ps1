# Claim Clash - Microsoft Store build (Release profile, MSI + offline WebView2)
#
# Tauri bundles Win32 apps for the Microsoft Store as a signed MSI with an
# offline WebView2 installer. Partner Center wraps that MSI into an MSIX package.
#
# Before first Store upload:
#   1. Enroll at https://developer.microsoft.com/en-us/microsoft-store
#   2. Host PRIVACY-POLICY.md at a public HTTPS URL
#   3. Set privacyPolicyUrl in version.json and homepage in tauri.store.conf.json
#   4. Code-sign the MSI (required for Store submission)
#
# Usage:
#   .\scripts\build-store.ps1
#   .\scripts\build-store.ps1 -Increment

param(
    [switch]$Increment
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not (Test-Path "package.json")) {
    Write-Error "Run this script from the claim-clash-tv project root."
}

Write-Host "=== Claim Clash Microsoft Store Build ===" -ForegroundColor Cyan

& (Join-Path $PSScriptRoot "set-build-profile.ps1") -Profile Release

if ($Increment) {
    & (Join-Path $PSScriptRoot "sync-version.ps1") -Increment
} else {
    & (Join-Path $PSScriptRoot "sync-version.ps1")
}

$ver = Get-Content "version.json" -Raw | ConvertFrom-Json
$privacyUrl = if ($ver.privacyPolicyUrl) { $ver.privacyPolicyUrl.Trim() } else { "" }
if (-not $privacyUrl -or $privacyUrl -match 'YOUR_USERNAME') {
    Write-Warning "privacyPolicyUrl in version.json is not set to a live HTTPS URL."
    Write-Warning "Microsoft Partner Center requires a privacy policy URL before submission."
}

Write-Host "`nRunning Tauri Store bundle (MSI + offline WebView2)..." -ForegroundColor Yellow
npm run tauri:store

$msiDir = Join-Path $root "src-tauri\target\release\bundle\msi"
if (-not (Test-Path $msiDir)) {
    Write-Error "MSI bundle folder not found at $msiDir. Build may have failed."
}

$msiFiles = Get-ChildItem $msiDir -Filter "*.msi" | Sort-Object LastWriteTime -Descending
if (-not $msiFiles.Count) {
    Write-Error "No .msi file produced under $msiDir"
}

$msi = $msiFiles[0]
$outputDir = Join-Path $root "dist"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$version = $pkg.version
$phase = if ($ver.phase) { $ver.phase.Trim() } else { "" }
$label = if ($phase) { "Claim Clash $version $phase Store.msi" } else { "Claim Clash $version Store.msi" }
$dest = Join-Path $outputDir $label

Copy-Item $msi.FullName $dest -Force
$hash = Get-FileHash -Algorithm SHA256 $dest
"$($hash.Hash)  $label" | Out-File -Encoding UTF8 -FilePath "$dest.sha256"

Write-Host "`nStore MSI ready (sign before Partner Center upload):" -ForegroundColor Green
Write-Host "  $dest"
Write-Host "`nPartner Center silent install argument for MSI: /quiet" -ForegroundColor Cyan
Write-Host "See MICROSOFT_STORE.md for capabilities and listing checklist." -ForegroundColor Cyan