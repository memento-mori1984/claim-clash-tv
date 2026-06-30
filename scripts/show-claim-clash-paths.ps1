# Print Claim Clash install and session folder paths for this Windows user.
#
# Usage:
#   .\scripts\show-claim-clash-paths.ps1
#   .\scripts\show-claim-clash-paths.ps1 -OpenInstallFolder

param(
    [switch]$OpenInstallFolder,
    [switch]$OpenSessionsFolder
)

$installDir = Join-Path $env:LOCALAPPDATA "Programs\Claim Clash"
$startMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Claim Clash"
$startLink = Join-Path $startMenuDir "Claim Clash.lnk"
$desktopLink = Join-Path ([Environment]::GetFolderPath("Desktop")) "Claim Clash.lnk"
$sessionsDir = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Claim Clash"

Write-Host ""
Write-Host "Claim Clash - paths on this PC" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Install folder:" -ForegroundColor Yellow
Write-Host "  $installDir"
if (Test-Path $installDir) {
    Get-ChildItem $installDir -File -Filter "Claim Clash *.exe" -ErrorAction SilentlyContinue |
        ForEach-Object { Write-Host "  App: $($_.FullName)" -ForegroundColor Green }
} else {
    Write-Host '  (not installed yet - run Install-Claim-Clash.ps1)' -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "Start Menu shortcut:" -ForegroundColor Yellow
Write-Host "  $startLink"
if (Test-Path $startLink) {
    Write-Host "  (exists)" -ForegroundColor Green
} else {
    Write-Host "  (not created yet)" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "Desktop shortcut:" -ForegroundColor Yellow
Write-Host "  $desktopLink"
if (Test-Path $desktopLink) {
    Write-Host "  (exists)" -ForegroundColor Green
} else {
    Write-Host '  (optional - use -DesktopShortcut when installing)' -ForegroundColor DarkGray
}
Write-Host ""
Write-Host 'Session saves (Save and Quit / auto-save):' -ForegroundColor Yellow
Write-Host "  $sessionsDir"
if (Test-Path $sessionsDir) {
    $count = (Get-ChildItem $sessionsDir -File -Filter "*.md" -ErrorAction SilentlyContinue).Count
    Write-Host "  ($count markdown backup files)" -ForegroundColor Green
} else {
    Write-Host "  (created on first save)" -ForegroundColor DarkGray
}
Write-Host ""

if ($OpenInstallFolder) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    Start-Process explorer.exe $installDir
}
if ($OpenSessionsFolder) {
    New-Item -ItemType Directory -Path $sessionsDir -Force | Out-Null
    Start-Process explorer.exe $sessionsDir
}