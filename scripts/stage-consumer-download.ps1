# Stage the consumer (Release) Windows installer into web-dist/download for public HTTPS download.
# Release builds only: no Dev suffix, no embedded API keys.
#
# Usage (from project root):
#   .\scripts\stage-consumer-download.ps1
#   .\scripts\stage-consumer-download.ps1 -OutputDir "C:\path\to\web-dist"

param(
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
if (-not $OutputDir) {
    $OutputDir = Join-Path $root "web-dist"
}

$distDir = Join-Path $root "dist"
$downloadDir = Join-Path $OutputDir "download"
New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null

$ver = Get-Content (Join-Path $root "version.json") -Raw | ConvertFrom-Json
$pkg = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$version = $pkg.version
$phase = if ($ver.phase) { $ver.phase.Trim() } else { "" }
$label = if ($phase) { "Claim Clash $version $phase" } else { "Claim Clash $version" }
$feedbackEmail = if ($ver.feedbackEmail) { $ver.feedbackEmail } else { "feedback@claim-clash.com" }

$stableSetupName = "Claim-Clash-Setup.exe"
$stablePortableName = "Claim-Clash-Portable.exe"
$stableSetupPath = Join-Path $downloadDir $stableSetupName
$stablePortablePath = Join-Path $downloadDir $stablePortableName

$setupSource = $null
$portableSource = $null
if (Test-Path $distDir) {
    $setupSource = Get-ChildItem $distDir -Filter "Claim Clash * - Setup.exe" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch '\bDev\b' } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    $portableSource = Get-ChildItem $distDir -Filter "Claim Clash *.exe" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch '\bDev\b' -and $_.Name -notmatch 'Setup' } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

$setupAvailable = $false
$portableAvailable = $false
if ($setupSource) {
    Copy-Item $setupSource.FullName $stableSetupPath -Force
    $setupAvailable = $true
    Write-Host "Staged consumer setup: $($setupSource.Name) -> download\$stableSetupName" -ForegroundColor Green
} else {
    if (Test-Path $stableSetupPath) { Remove-Item $stableSetupPath -Force }
    Write-Host "No Release NSIS setup in dist\. Portable exe will be offered if present." -ForegroundColor Yellow
}

if ($portableSource) {
    Copy-Item $portableSource.FullName $stablePortablePath -Force
    $portableAvailable = $true
    Write-Host "Staged consumer portable: $($portableSource.Name) -> download\$stablePortableName" -ForegroundColor Green
} elseif (Test-Path $stablePortablePath) {
    Remove-Item $stablePortablePath -Force
}

$installAvailable = $setupAvailable -or $portableAvailable
$primaryInstallPath = if ($setupAvailable) { "/download/$stableSetupName" } elseif ($portableAvailable) { "/download/$stablePortableName" } else { $null }
$primaryInstallFile = if ($setupAvailable) { $stableSetupName } elseif ($portableAvailable) { $stablePortableName } else { $null }
$installKind = if ($setupAvailable) { "setup" } elseif ($portableAvailable) { "portable" } else { "none" }

$guideTemplate = Join-Path $root "distribution\HOW-TO-INSTALL-CONSUMER.txt"
$guideOut = Join-Path $downloadDir "HOW-TO-INSTALL.txt"
if (Test-Path $guideTemplate) {
    $guideText = Get-Content $guideTemplate -Raw
    $guideText = $guideText.Replace('{{VERSION}}', $label).Replace('{{FEEDBACK_EMAIL}}', $feedbackEmail)
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($guideOut, $guideText.TrimEnd() + "`n", $utf8)
}

$manifest = [ordered]@{
    available = $installAvailable
    version = $version
    label = $label
    profile = "release"
    kind = $installKind
    primaryUrl = $primaryInstallPath
    setupUrl = if ($setupAvailable) { "/download/$stableSetupName" } else { $null }
    portableUrl = if ($portableAvailable) { "/download/$stablePortableName" } else { $null }
    guideUrl = "/download/HOW-TO-INSTALL.txt"
    notes = "Consumer Windows build only. No site password. No pre-filled API keys."
}
$manifestJson = ($manifest | ConvertTo-Json -Depth 4) + "`n"
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $downloadDir "manifest.json"), $manifestJson, $utf8)

return @{
    Available = $installAvailable
    PrimaryUrl = $primaryInstallPath
    PrimaryFile = $primaryInstallFile
    Kind = $installKind
}