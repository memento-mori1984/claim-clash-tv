# Sync Claim Clash version from version.json across package metadata and UI.
# Version format: {major}.{minor}.{iteration}  e.g. 0.1.19
# Portable exe name: Claim Clash {version} {phase}.exe  e.g. Claim Clash 0.1.19 Alpha.exe
#
# Usage (from project root):
#   .\scripts\sync-version.ps1              # sync only
#   .\scripts\sync-version.ps1 -Increment   # bump iteration, then sync

param(
    [switch]$Increment
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

$versionFile = Join-Path $root "version.json"
if (-not (Test-Path $versionFile)) {
    Write-Error "Missing version.json at $versionFile"
}

$ver = Get-Content $versionFile -Raw | ConvertFrom-Json
if ($Increment) {
    $ver.iteration = [int]$ver.iteration + 1
    Write-Utf8NoBom $versionFile (($ver | ConvertTo-Json -Depth 3) + "`n")
    Write-Host "Iteration bumped to $($ver.iteration)" -ForegroundColor Cyan
}

$version = "{0}.{1}.{2}" -f $ver.major, $ver.minor, $ver.iteration
Write-Host "Syncing version $version ..." -ForegroundColor Yellow

function Set-JsonVersion([string]$Path) {
    $text = [System.IO.File]::ReadAllText($Path)
    $text = $text -replace '(?m)^(\s*"version"\s*:\s*")[^"]+(")', "`${1}$version`${2}"
    Write-Utf8NoBom $Path $text
}

Set-JsonVersion (Join-Path $root "package.json")
Set-JsonVersion (Join-Path $root "src-tauri\tauri.conf.json")

$cargoPath = Join-Path $root "src-tauri\Cargo.toml"
$cargo = [System.IO.File]::ReadAllText($cargoPath)
$cargo = $cargo -replace '(?m)^version = ".*"$', "version = `"$version`""
Write-Utf8NoBom $cargoPath $cargo

$indexPath = Join-Path $root "src\index.html"
$index = [System.IO.File]::ReadAllText($indexPath)
$phase = if ($ver.phase) { $ver.phase.Trim() } else { "Alpha" }
$index = $index -replace 'const APP_VERSION = "[^"]+";', "const APP_VERSION = `"$version`";"
$index = $index -replace 'const APP_PHASE = "[^"]+";', "const APP_PHASE = `"$phase`";"
Write-Utf8NoBom $indexPath $index

Write-Host "Version $version synced to package.json, tauri.conf.json, Cargo.toml, and index.html" -ForegroundColor Green