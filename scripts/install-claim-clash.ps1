# Install Claim Clash portable build to %LOCALAPPDATA%\Programs\Claim Clash
# Creates Start Menu shortcut; optional desktop shortcut.
#
# Usage (from extracted Drive zip folder):
#   .\Install Claim Clash.ps1
#   .\Install Claim Clash.ps1 -DesktopShortcut

param(
    [string]$SourceDir = "",
    [switch]$DesktopShortcut
)

$ErrorActionPreference = "Stop"

function Find-ClaimClashExe([string]$Dir) {
    Get-ChildItem -Path $Dir -File -Filter "Claim Clash *.exe" |
        Where-Object { $_.Name -notlike "*setup*" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

if (-not $SourceDir) {
    $SourceDir = if ($PSScriptRoot -match '\\scripts$') {
        Split-Path $PSScriptRoot -Parent
    } else {
        $PSScriptRoot
    }
}

$exe = Find-ClaimClashExe $SourceDir
if (-not $exe) {
    Write-Error "No Claim Clash .exe found in $SourceDir. Extract the full zip first."
}

$installDir = Join-Path $env:LOCALAPPDATA "Programs\Claim Clash"
New-Item -ItemType Directory -Path $installDir -Force | Out-Null

$destExe = Join-Path $installDir $exe.Name
Copy-Item $exe.FullName $destExe -Force

$sha = Join-Path $SourceDir ($exe.Name + ".sha256")
if (Test-Path $sha) {
    Copy-Item $sha (Join-Path $installDir ($exe.Name + ".sha256")) -Force
}

$wsh = New-Object -ComObject WScript.Shell

$startMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Claim Clash"
New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null
$startLink = Join-Path $startMenuDir "Claim Clash.lnk"
$shortcut = $wsh.CreateShortcut($startLink)
$shortcut.TargetPath = $destExe
$shortcut.WorkingDirectory = $installDir
$shortcut.Description = "Claim Clash - built for two"
$shortcut.Save()

if ($DesktopShortcut) {
    $desktopLink = Join-Path ([Environment]::GetFolderPath("Desktop")) "Claim Clash.lnk"
    $desk = $wsh.CreateShortcut($desktopLink)
    $desk.TargetPath = $destExe
    $desk.WorkingDirectory = $installDir
    $desk.Description = "Claim Clash - built for two"
    $desk.Save()
    Write-Host "Desktop shortcut: $desktopLink" -ForegroundColor Green
}

# Copy uninstall helper beside installed exe
$uninstallSrc = Join-Path $PSScriptRoot "Uninstall Claim Clash.ps1"
if (-not (Test-Path $uninstallSrc)) {
    $uninstallSrc = Join-Path (Split-Path $PSScriptRoot -Parent) "scripts\uninstall-claim-clash.ps1"
}
if (Test-Path $uninstallSrc) {
    Copy-Item $uninstallSrc (Join-Path $installDir "Uninstall Claim Clash.ps1") -Force
}

$sessionsDir = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Claim Clash"

Write-Host ""
Write-Host "=== Install complete ===" -ForegroundColor Green
Write-Host "Install folder:  $installDir"
Write-Host "App:             $destExe"
Write-Host "Start Menu:      $startLink"
Write-Host "Session saves:   $sessionsDir"
Write-Host ""
Write-Host 'Launch from Start Menu. Use Save and Quit in the app to save your session and close.'