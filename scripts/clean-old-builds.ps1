# Remove outdated Claim Clash build artifacts so only the current iteration remains.
# Keeps the current version from version.json (exe, sha256, and Drive zip).
# Active channel: beta-dev (Beta phase) or alpha-dev (post-baseline Alpha). alpha-baseline/ is never touched.
#
# Runs automatically at the end of build-with-checksum.ps1 after each iteration.
#
# Usage (from project root):
#   .\scripts\clean-old-builds.ps1
#   .\scripts\clean-old-builds.ps1 -ClaimClashDir "D:\Backups\ClaimClash"

param(
    [string]$ClaimClashDir = "C:\Users\Ranzh\ClaimClash"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$channels = & (Join-Path $PSScriptRoot "resolve-alpha-channels.ps1") -ClaimClashDir $ClaimClashDir
$version = $channels.Version
$suffix = $channels.Suffix
$activeDir = $channels.ActiveClaimClashDir

$keepExe = "Claim Clash $version$suffix.exe"
$keepSha = "$keepExe.sha256"
$keepSetup = "Claim Clash $version$suffix - Setup.exe"
$keepSetupSha = "$keepSetup.sha256"
$keepZip = "Claim Clash $version$suffix - Drive.zip"
$distDir = Join-Path $root "dist"
$releaseDir = Join-Path $root "src-tauri\target\release"
$removed = @()

function Remove-IfOld([string]$Path, [string]$Reason) {
    if (Test-Path $Path) {
        Remove-Item $Path -Recurse -Force
        $script:removed += "$Reason : $Path"
    }
}

function Prune-ClaimClashFiles([string]$Dir, [string]$Reason) {
    if (-not (Test-Path $Dir)) { return }
    Get-ChildItem $Dir -File | Where-Object {
        ($_.Name -like 'Claim Clash*' -and $_.Name -ne $keepExe -and $_.Name -ne $keepSha -and $_.Name -ne $keepSetup -and $_.Name -ne $keepSetupSha -and $_.Name -ne $keepZip) -or
        ($_.Name -like 'ClaimClash_*') -or
        ($_.Name -eq 'Claim Clash.exe')
    } | ForEach-Object { Remove-IfOld $_.FullName $Reason }
}

if (Test-Path $distDir) {
    Get-ChildItem $distDir -File | Where-Object {
        ($_.Name -like 'Claim Clash*' -and $_.Name -ne $keepExe -and $_.Name -ne $keepSha -and $_.Name -ne $keepSetup -and $_.Name -ne $keepSetupSha -and $_.Name -ne $keepZip) -or
        ($_.Name -like 'ClaimClash_*')
    } | ForEach-Object { Remove-IfOld $_.FullName "dist file" }

    @('tester-package', 'email-package', 'tester-package-v20') | ForEach-Object {
        Remove-IfOld (Join-Path $distDir $_) "staging folder"
    }
}

Remove-IfOld (Join-Path $root "old-builds") "old-builds folder"

if (Test-Path $releaseDir) {
    Get-ChildItem $releaseDir -File | Where-Object {
        $_.Name -like 'Claim Clash*' -and $_.Name -ne $keepExe
    } | ForEach-Object { Remove-IfOld $_.FullName "release stray" }
}

# Dev channel (beta-dev or alpha-dev): prune old builds; also clear stray files from ClaimClash root.
if ($channels.UseDevChannel) {
    Prune-ClaimClashFiles $channels.DevDir "$($channels.ChannelName) file"
    Prune-ClaimClashFiles $ClaimClashDir "ClaimClash root stray"
} else {
    Prune-ClaimClashFiles $ClaimClashDir "ClaimClash file"
}

$oneDriveDir = "C:\Users\Ranzh\OneDrive"
if (Test-Path $oneDriveDir) {
    if ($channels.UseDevChannel) {
        $oneDriveDev = $channels.OneDriveDevDir
        New-Item -ItemType Directory -Path $oneDriveDev -Force | Out-Null
        Prune-ClaimClashFiles $oneDriveDev "OneDrive $($channels.ChannelName) file"
        Get-ChildItem $oneDriveDir -File | Where-Object {
            ($_.Name -like 'Claim Clash*') -or ($_.Name -like 'ClaimClash_*')
        } | ForEach-Object { Remove-IfOld $_.FullName "OneDrive root stray" }
    } else {
        Get-ChildItem $oneDriveDir -File | Where-Object {
            ($_.Name -like 'Claim Clash*' -and $_.Name -ne $keepZip) -or
            ($_.Name -like 'ClaimClash_*')
        } | ForEach-Object { Remove-IfOld $_.FullName "OneDrive file" }
    }
}

$currentExe = Join-Path $distDir $keepExe
$currentSha = Join-Path $distDir $keepSha
$currentSetup = Join-Path $distDir $keepSetup
$currentSetupSha = Join-Path $distDir $keepSetupSha
if (Test-Path $currentExe) {
    New-Item -ItemType Directory -Path $activeDir -Force | Out-Null
    Copy-Item $currentExe (Join-Path $activeDir $keepExe) -Force
    if (Test-Path $currentSha) {
        Copy-Item $currentSha (Join-Path $activeDir $keepSha) -Force
    }
    if (Test-Path $currentSetup) {
        Copy-Item $currentSetup (Join-Path $activeDir $keepSetup) -Force
    }
    if (Test-Path $currentSetupSha) {
        Copy-Item $currentSetupSha (Join-Path $activeDir $keepSetupSha) -Force
    }
}

Write-Host "Keeping: $keepExe" -ForegroundColor Green
if ($channels.UseDevChannel) {
    $extra = if ($channels.Phase -eq "Beta") { "" } else { " (baseline frozen at iteration $($channels.BaselineIteration))" }
    Write-Host "Channel: $($channels.ChannelName)$extra" -ForegroundColor Cyan
}
if (Test-Path (Join-Path $activeDir $keepZip)) {
    Write-Host "Keeping: $keepZip" -ForegroundColor Green
}
Write-Host "Removed $($removed.Count) outdated item(s):" -ForegroundColor Yellow
$removed | ForEach-Object { Write-Host "  $_" }