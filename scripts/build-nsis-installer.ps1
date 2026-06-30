# Claim Clash - NSIS installer build (Step 2 of installation program)
#
# NSIS/makensis cannot read scripts under C:\Windows\System32 (WoW64 path rules).
# This script stages the project to a user folder, runs `npm run tauri build` there,
# then copies the portable exe and NSIS setup back to the source project's dist/.
#
# Usage (from project root):
#   .\scripts\build-nsis-installer.ps1
#   .\scripts\build-nsis-installer.ps1 -NoIncrement
#   .\scripts\build-nsis-installer.ps1 -StagingRoot "D:\build\claim-clash-tv"

param(
    [switch]$NoIncrement,
    [switch]$Clean,
    [switch]$SkipDev,
    [string]$StagingRoot = ""
)

$ErrorActionPreference = "Stop"

function Test-IsSystem32Path([string]$Path) {
    if (-not $Path) { return $false }
    $normalized = [System.IO.Path]::GetFullPath($Path).TrimEnd('\').ToLowerInvariant()
    return $normalized -eq 'c:\windows\system32' -or $normalized -like 'c:\windows\system32\*'
}

function Get-ProjectLabel([string]$Root) {
    $pkg = Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
    $verMeta = Get-Content (Join-Path $Root "version.json") -Raw | ConvertFrom-Json
    $phase = if ($verMeta.phase) { $verMeta.phase.Trim() } else { "" }
    if ($phase) { return "Claim Clash $($pkg.version) $phase" }
    return "Claim Clash $($pkg.version)"
}

$sourceRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $sourceRoot "package.json"))) {
    Write-Error "Could not find package.json in $sourceRoot"
}

if (-not $StagingRoot) {
    $StagingRoot = Join-Path $env:USERPROFILE "ClaimClash\claim-clash-tv-build"
}

Write-Host "=== Claim Clash NSIS Installer Build (Step 2) ===" -ForegroundColor Cyan
Write-Host "Source:  $sourceRoot" -ForegroundColor DarkGray
Write-Host "Staging: $StagingRoot" -ForegroundColor DarkGray

if (Test-IsSystem32Path $sourceRoot) {
    Write-Host "`nNote: Source is under Windows\System32. NSIS will build from staging." -ForegroundColor Yellow
} else {
    Write-Host "`nSource is outside System32; staging still used for reproducible NSIS builds." -ForegroundColor DarkGray
}

Write-Host "`nSetting Release build profile..." -ForegroundColor Yellow
& (Join-Path $sourceRoot "scripts\set-build-profile.ps1") -Profile Release

Write-Host "`nSyncing version metadata..." -ForegroundColor Yellow
if ($NoIncrement) {
    & (Join-Path $sourceRoot "scripts\sync-version.ps1")
} else {
    & (Join-Path $sourceRoot "scripts\sync-version.ps1") -Increment
}

Write-Host "`nStaging source to $StagingRoot ..." -ForegroundColor Yellow
if ($Clean -and (Test-Path $StagingRoot)) {
    Remove-Item $StagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $StagingRoot -Force | Out-Null

$robocopyArgs = @(
    $sourceRoot,
    $StagingRoot,
    "/MIR",
    "/XD", "node_modules", "src-tauri\target", ".git",
    "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"
)
$robocopyExit = 0
& robocopy @robocopyArgs | Out-Null
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -ge 8) {
    Write-Error "robocopy staging failed with exit code $robocopyExit"
}

Push-Location $StagingRoot
try {
    if (-not (Test-Path "node_modules")) {
        Write-Host "`nInstalling npm dependencies in staging..." -ForegroundColor Yellow
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "npm install failed with exit code $LASTEXITCODE"
        }
    }

    if ($Clean) {
        Write-Host "`nCleaning Rust target in staging..." -ForegroundColor Yellow
        Push-Location "src-tauri"
        try {
            cargo clean
            if ($LASTEXITCODE -ne 0) {
                Write-Error "cargo clean failed with exit code $LASTEXITCODE"
            }
        } finally {
            Pop-Location
        }
    }

    Write-Host "`nRunning Tauri build with NSIS bundler..." -ForegroundColor Yellow
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        npm run tauri build 2>&1 | ForEach-Object { Write-Host $_ }
        $tauriExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
    }
    if ($tauriExit -ne 0) {
        Write-Error "Tauri NSIS build failed with exit code $tauriExit"
    }
} finally {
    Pop-Location
}

$pkg = Get-Content (Join-Path $sourceRoot "package.json") -Raw | ConvertFrom-Json
$verMeta = Get-Content (Join-Path $sourceRoot "version.json") -Raw | ConvertFrom-Json
$version = $pkg.version
$phase = if ($verMeta.phase) { $verMeta.phase.Trim() } else { "" }
$portableName = if ($phase) { "Claim Clash $version $phase.exe" } else { "Claim Clash $version.exe" }
$setupBundleName = if ($phase) { "Claim Clash $version $phase - Setup.exe" } else { "Claim Clash $version - Setup.exe" }

$stagingPortable = Join-Path $StagingRoot "src-tauri\target\release\claim-clash-tv.exe"
$stagingSetup = Get-ChildItem (Join-Path $StagingRoot "src-tauri\target\release\bundle\nsis") -Filter "*-setup.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not (Test-Path $stagingPortable)) {
    Write-Error "Portable exe missing after staging build: $stagingPortable"
}
if (-not $stagingSetup) {
    Write-Error "NSIS setup exe missing after staging build in $(Join-Path $StagingRoot 'src-tauri\target\release\bundle\nsis')"
}

$distDir = Join-Path $sourceRoot "dist"
New-Item -ItemType Directory -Path $distDir -Force | Out-Null

$portableDest = Join-Path $distDir $portableName
$setupDest = Join-Path $distDir $setupBundleName
Copy-Item $stagingPortable $portableDest -Force
Copy-Item $stagingSetup.FullName $setupDest -Force

foreach ($pair in @(
        @{ Path = $portableDest; Name = $portableName },
        @{ Path = $setupDest; Name = $setupBundleName }
    )) {
    $hash = Get-FileHash -Algorithm SHA256 $pair.Path
    "$($hash.Hash)  $($pair.Name)" | Out-File -Encoding UTF8 -FilePath "$($pair.Path).sha256"
}

$changeLogs = Join-Path $sourceRoot "CHANGE LOGS.txt"
if (Test-Path $changeLogs) {
    Copy-Item $changeLogs (Join-Path $distDir "CHANGE LOGS.txt") -Force
    $logsText = Get-Content $changeLogs -Raw
    $packagedLabel = if ($phase) { "$version $phase" } else { $version }
    if ($logsText -match '(?m)^Current packaged build in dist:.*$') {
        $logsText = $logsText -replace '(?m)^Current packaged build in dist:.*$', "Current packaged build in dist: $packagedLabel"
        $utf8 = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($changeLogs, $logsText, $utf8)
        Copy-Item $changeLogs (Join-Path $distDir "CHANGE LOGS.txt") -Force
    }
}

Write-Host "`nCleaning up outdated build artifacts..." -ForegroundColor Yellow
& (Join-Path $sourceRoot "scripts\clean-old-builds.ps1") -Target Release

$channels = & (Join-Path $sourceRoot "scripts\resolve-alpha-channels.ps1")
$safeDir = $channels.ActiveClaimClashDir
New-Item -ItemType Directory -Path $safeDir -Force | Out-Null
$safeSetupDest = Join-Path $safeDir $setupBundleName
Copy-Item $setupDest $safeSetupDest -Force
Copy-Item "$setupDest.sha256" "$safeSetupDest.sha256" -Force

if (-not $SkipDev) {
    Write-Host "`n=== Packaging developer testing build (beta-dev) ===" -ForegroundColor Cyan
    Push-Location $sourceRoot
    try {
        & (Join-Path $sourceRoot "scripts\build-dev.ps1") -SkipVersionSync
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }
}

Write-Host "`n=== NSIS Build Complete ===" -ForegroundColor Green
Write-Host "Portable exe:  $portableDest"
Write-Host "NSIS setup:    $setupDest"
Write-Host ""
Write-Host "RUN SETUP FROM HERE (safe - not System32):" -ForegroundColor Green
Write-Host "  $safeSetupDest"
Write-Host ""
Write-Host "Or use: .\Run-Claim-Clash-Setup.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "WARNING: Double-clicking setup inside dist\ under System32 fails with" -ForegroundColor Yellow
Write-Host "         'NSIS Error: error launching installer'. Use the safe path above." -ForegroundColor Yellow
Write-Host ""
Write-Host "Staging kept:  $StagingRoot" -ForegroundColor DarkGray
Write-Host "Silent install: .\Run-Claim-Clash-Setup.ps1 -Silent" -ForegroundColor DarkGray