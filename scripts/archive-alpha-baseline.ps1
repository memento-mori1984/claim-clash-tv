# Freeze the alpha baseline build (first wave sent to testers) into alpha-baseline/.
# Safe to run multiple times; only copies files that exist and are missing in the baseline folder.

param(
    [string]$ClaimClashDir = "C:\Users\Ranzh\ClaimClash"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$channels = & (Join-Path $PSScriptRoot "resolve-alpha-channels.ps1") -ClaimClashDir $ClaimClashDir
$baselineDir = $channels.BaselineDir
$baselineIteration = $channels.BaselineIteration

if ($baselineIteration -le 0) {
    Write-Error "Set alphaBaselineIteration in version.json before archiving."
}

$ver = Get-Content (Join-Path $root "version.json") -Raw | ConvertFrom-Json
$baselineVersion = "{0}.{1}.{2}" -f $ver.major, $ver.minor, $baselineIteration
$phase = if ($ver.phase) { $ver.phase.Trim() } else { "" }
$suffix = if ($phase) { " $phase" } else { "" }

$names = @(
    "Claim Clash $baselineVersion$suffix.exe",
    "Claim Clash $baselineVersion$suffix.exe.sha256",
    "Claim Clash $baselineVersion$suffix - Drive.zip"
)

$searchDirs = @(
    (Join-Path $root "dist"),
    $ClaimClashDir
) | Select-Object -Unique

New-Item -ItemType Directory -Path $baselineDir -Force | Out-Null
$copied = @()

foreach ($name in $names) {
    $dest = Join-Path $baselineDir $name
    if (Test-Path $dest) { continue }
    foreach ($dir in $searchDirs) {
        $src = Join-Path $dir $name
        if (Test-Path $src) {
            Copy-Item $src $dest -Force
            $copied += $dest
            break
        }
    }
}

$marker = Join-Path $baselineDir "BASELINE.txt"
$markerText = @"
Claim Clash alpha baseline (first tester wave)
Version: $baselineVersion$suffix
Frozen: do not overwrite. Post-baseline builds go to alpha-dev/.
"@
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($marker, $markerText.Trim(), $utf8)

Write-Host "Baseline folder: $baselineDir" -ForegroundColor Green
if ($copied.Count -eq 0) {
    Write-Host "Baseline files already present (no new copies)." -ForegroundColor Yellow
} else {
    $copied | ForEach-Object { Write-Host "  Copied $_" }
}