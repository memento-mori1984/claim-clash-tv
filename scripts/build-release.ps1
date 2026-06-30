# Claim Clash - Release build (dist) + developer testing build (beta-dev)
# Every normal build updates BOTH outputs unless -SkipDev is passed.
#
# Usage:
#   .\scripts\build-release.ps1
#   .\scripts\build-release.ps1 -Increment
#   .\scripts\build-release.ps1 -SkipVersionSync -PortableOnly
#   .\scripts\build-release.ps1 -SkipDev   # release only (unusual)

param(
    [switch]$Increment,
    [switch]$SkipVersionSync,
    [switch]$SkipDev,
    [switch]$PortableOnly
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

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
if ($PortableOnly) {
    npm run tauri build -- --no-bundle
} else {
    npm run tauri build
}

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
$checksumPath = "$finalPath.sha256"
"$($hash.Hash)  $finalName" | Out-File -Encoding UTF8 -FilePath $checksumPath
$verifyHash = (Get-FileHash -Algorithm SHA256 $finalPath).Hash
if ($verifyHash -ne $hash.Hash) {
    Write-Error "Checksum verification failed for $finalPath"
}

$setupPath = $null
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

$changeLogs = Join-Path $root "CHANGE LOGS.txt"
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

Write-Host "`nCleaning up outdated dist artifacts..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "clean-old-builds.ps1") -Target Release

Write-Host "`nRelease build complete (no embedded API keys):" -ForegroundColor Green
Write-Host "  $finalPath"
Write-Host "  $checksumPath"
if ($setupPath) {
    Write-Host "  $setupPath"
    Write-Host "  $setupPath.sha256"
}

if (-not $SkipDev) {
    Write-Host "`n=== Packaging developer testing build (beta-dev) ===" -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "build-dev.ps1") -SkipVersionSync
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "`n=== All packaged builds up to date ===" -ForegroundColor Green
Write-Host "  Release: dist\$finalName"
if (-not $SkipDev) {
    $devName = if ($phase) { "Claim Clash $version $phase Dev.exe" } else { "Claim Clash $version Dev.exe" }
    Write-Host "  Dev:     C:\Users\Ranzh\ClaimClash\beta-dev\$devName"
}