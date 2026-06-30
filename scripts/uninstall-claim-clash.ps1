# Uninstall Claim Clash from %LOCALAPPDATA%\Programs\Claim Clash
#
# Usage:
#   .\Uninstall Claim Clash.ps1

$ErrorActionPreference = "Stop"

$installDir = Join-Path $env:LOCALAPPDATA "Programs\Claim Clash"
$startMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Claim Clash"
$desktopLink = Join-Path ([Environment]::GetFolderPath("Desktop")) "Claim Clash.lnk"

if (Test-Path $desktopLink) {
    Remove-Item $desktopLink -Force
    Write-Host "Removed desktop shortcut." -ForegroundColor Yellow
}

if (Test-Path $startMenuDir) {
    Remove-Item $startMenuDir -Recurse -Force
    Write-Host "Removed Start Menu folder." -ForegroundColor Yellow
}

if (Test-Path $installDir) {
    Remove-Item $installDir -Recurse -Force
    Write-Host "Removed install folder: $installDir" -ForegroundColor Yellow
} else {
    Write-Host "Install folder not found (already removed?)." -ForegroundColor DarkGray
}

Write-Host "Claim Clash uninstalled. Session backups in Documents\Claim Clash\ were not deleted." -ForegroundColor Green