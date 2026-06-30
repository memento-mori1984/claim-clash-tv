# Claim Clash - Release MSIX build for Microsoft Store (winapp CLI)
#
# Builds a Release Tauri exe (no embedded API keys), wraps it in MSIX via winapp.
# Stages to a clean folder when source lives under C:\Windows\System32.
#
# Prerequisites:
#   winget install Microsoft.WinAppCli
#
# Usage:
#   .\scripts\build-msix-store.ps1
#   .\scripts\build-msix-store.ps1 -NoIncrement
#   .\scripts\build-msix-store.ps1 -RunWithIdentity   # test with package identity, no MSIX install
#   .\scripts\build-msix-store.ps1 -InstallDevCert  # admin: trust devcert.pfx for local MSIX install

param(
    [switch]$NoIncrement,
    [switch]$RunWithIdentity,
    [switch]$InstallDevCert,
    [string]$StagingRoot = ""
)

$ErrorActionPreference = "Stop"

function Test-IsSystem32Path([string]$Path) {
    if (-not $Path) { return $false }
    $normalized = [System.IO.Path]::GetFullPath($Path).TrimEnd('\').ToLowerInvariant()
    return $normalized -eq 'c:\windows\system32' -or $normalized -like 'c:\windows\system32\*'
}

function Get-MsixVersion([string]$SemVer) {
    $parts = $SemVer.Trim() -split '\.'
    $major = if ($parts.Length -gt 0 -and $parts[0] -match '^\d+$') { [int]$parts[0] } else { 0 }
    $minor = if ($parts.Length -gt 1 -and $parts[1] -match '^\d+$') { [int]$parts[1] } else { 0 }
    $build = if ($parts.Length -gt 2 -and $parts[2] -match '^\d+$') { [int]$parts[2] } else { 0 }
    return "$major.$minor.$build.0"
}

function Update-ManifestVersion([string]$ManifestPath, [string]$MsixVersion) {
    $lines = Get-Content $ManifestPath
    $changed = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\s*Version="') {
            $lines[$i] = "    Version=""$MsixVersion"" />"
            $changed = $true
            break
        }
    }
    if (-not $changed) {
        Write-Warning "Could not update Version in $ManifestPath"
    } else {
        Set-Content -Path $ManifestPath -Value $lines -Encoding UTF8
    }
}

function Get-StoreIdentity([string]$MsixDir) {
    $identityPath = Join-Path $MsixDir "store-identity.json"
    if (-not (Test-Path $identityPath)) {
        Write-Error "Missing $identityPath (Partner Center package identity)."
    }
    return Get-Content $identityPath -Raw | ConvertFrom-Json
}

function Update-ManifestIdentity([string]$ManifestPath, $Identity) {
    $lines = Get-Content $ManifestPath
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\s*Name="') {
            $lines[$i] = "    Name=""$($Identity.packageIdentityName)"""
        } elseif ($lines[$i] -match '^\s*Publisher="') {
            $lines[$i] = "    Publisher=""$($Identity.publisher)"""
        } elseif ($lines[$i] -match '<PublisherDisplayName>') {
            $lines[$i] = "    <PublisherDisplayName>$($Identity.publisherDisplayName)</PublisherDisplayName>"
        }
    }
    Set-Content -Path $ManifestPath -Value $lines -Encoding UTF8
}

function Ensure-WinAppCli {
    if (-not (Get-Command winapp -ErrorAction SilentlyContinue)) {
        Write-Error "winapp CLI not found. Install with: winget install Microsoft.WinAppCli"
    }
}

$sourceRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $sourceRoot "package.json"))) {
    Write-Error "Run this script from the claim-clash-tv project root."
}

Ensure-WinAppCli

if (-not $StagingRoot) {
    $StagingRoot = Join-Path $env:USERPROFILE "ClaimClash\claim-clash-tv-build"
}

$buildRoot = $sourceRoot
if (Test-IsSystem32Path $sourceRoot) {
    $buildRoot = $StagingRoot
    Write-Host "=== Claim Clash MSIX Store Build (staged) ===" -ForegroundColor Cyan
    Write-Host "Source:  $sourceRoot" -ForegroundColor DarkGray
    Write-Host "Staging: $StagingRoot" -ForegroundColor DarkGray

    Write-Host "`nStaging source..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $StagingRoot -Force | Out-Null
    $robocopyArgs = @(
        $sourceRoot,
        $StagingRoot,
        "/MIR",
        "/XD", "node_modules", "src-tauri\target", ".git", "msix\dist",
        "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"
    )
    & robocopy @robocopyArgs | Out-Null
    if ($LASTEXITCODE -ge 8) {
        Write-Error "robocopy staging failed with exit code $LASTEXITCODE"
    }
} else {
    Write-Host "=== Claim Clash MSIX Store Build ===" -ForegroundColor Cyan
}

Push-Location $buildRoot
try {
    Write-Host "`nSetting Release build profile (no embedded API keys)..." -ForegroundColor Yellow
    & (Join-Path $buildRoot "scripts\set-build-profile.ps1") -Profile Release

    Write-Host "`nSyncing version metadata..." -ForegroundColor Yellow
    if ($NoIncrement) {
        & (Join-Path $buildRoot "scripts\sync-version.ps1")
    } else {
        & (Join-Path $buildRoot "scripts\sync-version.ps1") -Increment
    }

    if (-not (Test-Path "node_modules")) {
        Write-Host "`nInstalling npm dependencies..." -ForegroundColor Yellow
        npm install
        if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed" }
    }

    Write-Host "`nBuilding Release Tauri exe (no installer bundle)..." -ForegroundColor Yellow
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        npm run tauri -- build --config src-tauri/tauri.store.conf.json --no-bundle 2>&1 | ForEach-Object { Write-Host $_ }
        $tauriExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
    }
    if ($tauriExit -ne 0) {
        Write-Error "Tauri build failed with exit code $tauriExit"
    }

    $builtExe = Join-Path $buildRoot "src-tauri\target\release\claim-clash-tv.exe"
    if (-not (Test-Path $builtExe)) {
        Write-Error "Release exe not found: $builtExe"
    }

    $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
    $msixVersion = Get-MsixVersion $pkg.version
    $msixDir = Join-Path $buildRoot "msix"
    $manifestPath = Join-Path $msixDir "Package.appxmanifest"
    if (-not (Test-Path $manifestPath)) {
        Write-Error "Missing $manifestPath. Run winapp manifest generate in msix/ first (see msix/MSIX-TESTING.txt)."
    }

    $storeIdentity = Get-StoreIdentity $msixDir
    Update-ManifestIdentity $manifestPath $storeIdentity
    Update-ManifestVersion $manifestPath $msixVersion

    $packDist = Join-Path $msixDir "dist"
    if (Test-Path $packDist) {
        Remove-Item $packDist -Recurse -Force
    }
    New-Item -ItemType Directory -Path $packDist -Force | Out-Null

    $packagedExeName = "ClaimClash.exe"
    Copy-Item $builtExe (Join-Path $packDist $packagedExeName) -Force

    Push-Location $msixDir
    try {
        if ($RunWithIdentity) {
            Write-Host "`nRunning with package identity (winapp run)..." -ForegroundColor Yellow
            winapp run .\dist
            return
        }

        $certPath = Join-Path $msixDir "devcert.pfx"
        $publisher = $storeIdentity.publisher
        if (-not (Test-Path $certPath)) {
            Write-Host "`nGenerating development signing certificate ($publisher)..." -ForegroundColor Yellow
            winapp cert generate --if-exists skip --publisher $publisher
        }

        if ($InstallDevCert) {
            Write-Host "`nInstalling dev certificate (admin required)..." -ForegroundColor Yellow
            winapp cert install $certPath
        }

        Write-Host "`nPackaging MSIX..." -ForegroundColor Yellow
        winapp package .\dist --manifest Package.appxmanifest --cert $certPath
        if ($LASTEXITCODE -ne 0) {
            Write-Error "winapp package failed"
        }

        $msixFile = Get-ChildItem $msixDir -Filter "ClaimClash_*.msix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $msixFile) {
            $msixFile = Get-ChildItem $msixDir -Filter "*.msix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        }
        if (-not $msixFile) {
            Write-Error "No .msix file produced in $msixDir"
        }

        $outDir = Join-Path $sourceRoot "dist"
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null
        $destName = "Claim Clash $msixVersion Store.msix"
        $destPath = Join-Path $outDir $destName
        Copy-Item $msixFile.FullName $destPath -Force
        $hash = Get-FileHash -Algorithm SHA256 $destPath
        "$($hash.Hash)  $destName" | Out-File -Encoding UTF8 -FilePath "$destPath.sha256"

        Write-Host "`nMSIX build complete:" -ForegroundColor Green
        Write-Host "  $destPath"
        Write-Host "`nLocal install (first time):" -ForegroundColor Cyan
        Write-Host "  1. Admin: .\scripts\build-msix-store.ps1 -InstallDevCert"
        Write-Host "  2. Double-click the .msix, or: Add-AppxPackage -Path '$destPath'"
        Write-Host "`nBefore Store upload, verify Cast, session saves, and export (see msix/MSIX-TESTING.txt)." -ForegroundColor Cyan
    } finally {
        Pop-Location
    }
} finally {
    Pop-Location
}