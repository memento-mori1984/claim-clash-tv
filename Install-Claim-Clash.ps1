# Install Claim Clash and show where files live on your PC.
#
# Run from project root (after build):
#   .\Install-Claim-Clash.ps1
#   .\Install-Claim-Clash.ps1 -DesktopShortcut
#   .\Install-Claim-Clash.ps1 -Launch
#
# Paths only (no install):
#   .\Install-Claim-Clash.ps1 -PathsOnly
#   .\Install-Claim-Clash.ps1 -PathsOnly -OpenInstallFolder

param(
    [switch]$PathsOnly,
    [switch]$DesktopShortcut,
    [switch]$Launch,
    [switch]$OpenInstallFolder,
    [string]$SourceDir = ""
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$pathsScript = Join-Path $root "scripts\show-claim-clash-paths.ps1"
$installScript = Join-Path $root "scripts\install-claim-clash.ps1"

if ($PathsOnly) {
    & $pathsScript -OpenInstallFolder:$OpenInstallFolder
    exit 0
}

if (-not $SourceDir) {
    $dist = Join-Path $root "dist"
    if (Test-Path (Join-Path $dist "Claim Clash *.exe")) {
        $SourceDir = $dist
    } else {
        $SourceDir = $root
    }
}

if (-not (Test-Path $installScript)) {
    Write-Error "Missing $installScript"
}

Write-Host "=== Install Claim Clash ===" -ForegroundColor Cyan
Write-Host "Source: $SourceDir" -ForegroundColor DarkGray
Write-Host ""

& $installScript -SourceDir $SourceDir -DesktopShortcut:$DesktopShortcut

Write-Host ""
& $pathsScript

if ($Launch) {
    $installDir = Join-Path $env:LOCALAPPDATA "Programs\Claim Clash"
    $exe = Get-ChildItem $installDir -File -Filter "Claim Clash *.exe" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($exe) {
        Write-Host "Launching $($exe.Name)..." -ForegroundColor Cyan
        Start-Process -FilePath $exe.FullName -WorkingDirectory $installDir
    }
}

if ($OpenInstallFolder) {
    & $pathsScript -OpenInstallFolder
}