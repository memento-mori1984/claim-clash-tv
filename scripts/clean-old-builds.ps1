# Remove outdated Claim Clash build artifacts from dist/ and ClaimClash/.
# Keeps the current version from version.json (exe, sha256, and Drive zip).
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

$ver = Get-Content (Join-Path $root "version.json") -Raw | ConvertFrom-Json
$version = "{0}.{1}.{2}" -f $ver.major, $ver.minor, $ver.iteration
$phase = if ($ver.phase) { $ver.phase.Trim() } else { "" }
$suffix = if ($phase) { " $phase" } else { "" }

$keepExe = "Claim Clash $version$suffix.exe"
$keepSha = "$keepExe.sha256"
$keepZip = "Claim Clash $version$suffix - Drive.zip"
$distDir = Join-Path $root "dist"
$removed = @()

function Remove-IfOld([string]$Path, [string]$Reason) {
    if (Test-Path $Path) {
        Remove-Item $Path -Recurse -Force
        $script:removed += "$Reason : $Path"
    }
}

if (Test-Path $distDir) {
    Get-ChildItem $distDir -File | Where-Object {
        $_.Name -like 'Claim Clash*' -and $_.Name -ne $keepExe -and $_.Name -ne $keepSha
    } | ForEach-Object { Remove-IfOld $_.FullName "dist file" }

    @('tester-package', 'email-package', 'tester-package-v20') | ForEach-Object {
        Remove-IfOld (Join-Path $distDir $_) "staging folder"
    }
}

if (Test-Path $ClaimClashDir) {
    Get-ChildItem $ClaimClashDir -File | Where-Object {
        ($_.Name -like 'Claim Clash*' -and $_.Name -ne $keepExe -and $_.Name -ne $keepZip) -or
        ($_.Name -like 'ClaimClash_*') -or
        ($_.Name -eq 'Claim Clash.exe')
    } | ForEach-Object { Remove-IfOld $_.FullName "ClaimClash file" }
}

Write-Host "Keeping: $keepExe" -ForegroundColor Green
if (Test-Path (Join-Path $ClaimClashDir $keepZip)) {
    Write-Host "Keeping: $keepZip" -ForegroundColor Green
}
Write-Host "Removed $($removed.Count) outdated item(s):" -ForegroundColor Yellow
$removed | ForEach-Object { Write-Host "  $_" }