# Resolves Claim Clash distribution folders based on version.json phase.
# Alpha baseline (first tester wave) stays in alpha-baseline/ and is never auto-deleted.
# Alpha post-baseline builds go to alpha-dev/. Beta builds go to beta-dev/.

param(
    [string]$ClaimClashDir = "C:\Users\Ranzh\ClaimClash",
    [string]$OneDriveDir = "C:\Users\Ranzh\OneDrive"
)

$root = Split-Path $PSScriptRoot -Parent
$ver = Get-Content (Join-Path $root "version.json") -Raw | ConvertFrom-Json
$version = "{0}.{1}.{2}" -f $ver.major, $ver.minor, $ver.iteration
$phase = if ($ver.phase) { $ver.phase.Trim() } else { "" }
$suffix = if ($phase) { " $phase" } else { "" }
$baselineIteration = if ($null -ne $ver.alphaBaselineIteration) { [int]$ver.alphaBaselineIteration } else { 0 }
$currentIteration = [int]$ver.iteration
$isPostBaseline = $baselineIteration -gt 0 -and $currentIteration -gt $baselineIteration

$baselineDir = Join-Path $ClaimClashDir "alpha-baseline"

if ($phase -eq "Beta") {
    $devDir = Join-Path $ClaimClashDir "beta-dev"
    $oneDriveDevDir = Join-Path $OneDriveDir "Claim Clash beta-dev"
    $channelName = "beta-dev"
    $useDevChannel = $true
    $activeClaimClashDir = $devDir
} else {
    $devDir = Join-Path $ClaimClashDir "alpha-dev"
    $oneDriveDevDir = Join-Path $OneDriveDir "Claim Clash alpha-dev"
    $channelName = "alpha-dev"
    $useDevChannel = $isPostBaseline
    $activeClaimClashDir = if ($isPostBaseline) { $devDir } else { $ClaimClashDir }
}

[PSCustomObject]@{
    Version             = $version
    Suffix              = $suffix
    Phase               = $phase
    BaselineIteration   = $baselineIteration
    CurrentIteration    = $currentIteration
    IsPostBaseline      = $isPostBaseline
    UseDevChannel       = $useDevChannel
    ChannelName         = $channelName
    BaselineDir         = $baselineDir
    DevDir              = $devDir
    OneDriveDevDir      = $oneDriveDevDir
    ActiveClaimClashDir = $activeClaimClashDir
}