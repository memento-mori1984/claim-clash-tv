# Remove outdated Claim Clash build artifacts so only the current iteration remains.
# Release builds: dist/ only (main portable exe).
# Dev builds: beta-dev/ only (developer testing exe with embedded keys).
# alpha-baseline/ is never touched.
#
# Usage (from project root):
#   .\scripts\clean-old-builds.ps1 -Target Release
#   .\scripts\clean-old-builds.ps1 -Target Dev
#   .\scripts\clean-old-builds.ps1 -ClaimClashDir "D:\Backups\ClaimClash"

param(
    [ValidateSet('Release', 'Dev', 'All')]
    [string]$Target = 'Release',
    [string]$ClaimClashDir = "C:\Users\Ranzh\ClaimClash"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$channels = & (Join-Path $PSScriptRoot "resolve-alpha-channels.ps1") -ClaimClashDir $ClaimClashDir
$version = $channels.Version
$suffix = $channels.Suffix
$activeDir = $channels.ActiveClaimClashDir

$keepReleaseExe = "Claim Clash $version$suffix.exe"
$keepReleaseSha = "$keepReleaseExe.sha256"
$keepDevExe = "Claim Clash $version$suffix Dev.exe"
$keepDevSha = "$keepDevExe.sha256"
$keepSetup = "Claim Clash $version$suffix - Setup.exe"
$keepSetupSha = "$keepSetup.sha256"
$keepZip = "Claim Clash $version$suffix - Drive.zip"
$distDir = Join-Path $root "dist"
$devDir = Join-Path $ClaimClashDir "beta-dev"
$releaseDir = Join-Path $root "src-tauri\target\release"
$removed = @()

function Remove-IfOld([string]$Path, [string]$Reason) {
    if (Test-Path $Path) {
        Remove-Item $Path -Recurse -Force
        $script:removed += "$Reason : $Path"
    }
}

function Prune-ClaimClashFiles([string]$Dir, [string]$Reason, [string]$KeepExe, [string]$KeepSha) {
    if (-not (Test-Path $Dir)) { return }
    Get-ChildItem $Dir -File | Where-Object {
        ($_.Name -like 'Claim Clash*' -and $_.Name -ne $KeepExe -and $_.Name -ne $KeepSha -and $_.Name -ne $keepSetup -and $_.Name -ne $keepSetupSha -and $_.Name -ne $keepZip) -or
        ($_.Name -like 'ClaimClash_*') -or
        ($_.Name -eq 'Claim Clash.exe')
    } | ForEach-Object { Remove-IfOld $_.FullName $Reason }
}

if ($Target -eq 'Release' -or $Target -eq 'All') {
    if (Test-Path $distDir) {
        Get-ChildItem $distDir -File | Where-Object {
            ($_.Name -like 'Claim Clash*' -and $_.Name -ne $keepReleaseExe -and $_.Name -ne $keepReleaseSha -and $_.Name -ne $keepSetup -and $_.Name -ne $keepSetupSha -and $_.Name -ne $keepZip) -or
            ($_.Name -like 'ClaimClash_*')
        } | ForEach-Object { Remove-IfOld $_.FullName "dist file" }

        @('tester-package', 'email-package', 'tester-package-v20') | ForEach-Object {
            Remove-IfOld (Join-Path $distDir $_) "staging folder"
        }
    }
}

Remove-IfOld (Join-Path $root "old-builds") "old-builds folder"

if (Test-Path $releaseDir) {
    Get-ChildItem $releaseDir -File | Where-Object {
        $_.Name -like 'Claim Clash*' -and $_.Name -ne $keepReleaseExe -and $_.Name -ne $keepDevExe
    } | ForEach-Object { Remove-IfOld $_.FullName "release stray" }
}

if ($Target -eq 'Dev' -or $Target -eq 'All') {
    Prune-ClaimClashFiles $devDir "beta-dev file" $keepDevExe $keepDevSha
}

if ($Target -eq 'Release' -or $Target -eq 'All') {
    Prune-ClaimClashFiles $ClaimClashDir "ClaimClash root stray" $keepReleaseExe $keepReleaseSha
}

$oneDriveDir = "C:\Users\Ranzh\OneDrive"
if (Test-Path $oneDriveDir) {
    $oneDriveDev = Join-Path $oneDriveDir "Claim Clash beta-dev"
    if ($Target -eq 'Dev' -or $Target -eq 'All') {
        New-Item -ItemType Directory -Path $oneDriveDev -Force | Out-Null
        Prune-ClaimClashFiles $oneDriveDev "OneDrive beta-dev file" $keepDevExe $keepDevSha
    }
    if ($Target -eq 'Release' -or $Target -eq 'All') {
        Get-ChildItem $oneDriveDir -File | Where-Object {
            ($_.Name -like 'Claim Clash*' -and $_.Name -ne $keepZip) -or
            ($_.Name -like 'ClaimClash_*')
        } | ForEach-Object { Remove-IfOld $_.FullName "OneDrive root stray" }
    }
}

if ($Target -eq 'Release' -or $Target -eq 'All') {
    Write-Host "Keeping (release): $keepReleaseExe" -ForegroundColor Green
}
if ($Target -eq 'Dev' -or $Target -eq 'All') {
    Write-Host "Keeping (dev): $keepDevExe" -ForegroundColor Green
    Write-Host "Dev folder: $devDir" -ForegroundColor Cyan
}
if (Test-Path (Join-Path $devDir $keepZip)) {
    Write-Host "Keeping: $keepZip" -ForegroundColor Green
}
Write-Host "Removed $($removed.Count) outdated item(s):" -ForegroundColor Yellow
$removed | ForEach-Object { Write-Host "  $_" }