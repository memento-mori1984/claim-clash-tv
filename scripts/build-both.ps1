# Claim Clash - Alias for build-release.ps1 (release + beta-dev together)
#
# Usage:
#   .\scripts\build-both.ps1
#   .\scripts\build-both.ps1 -NoIncrement
#   .\scripts\build-both.ps1 -PortableOnly

param(
    [switch]$NoIncrement,
    [switch]$PortableOnly,
    [switch]$SkipDev
)

$ErrorActionPreference = "Stop"

$releaseParams = @{
    PortableOnly = [bool]$PortableOnly
    SkipDev        = [bool]$SkipDev
}
if ($NoIncrement) {
    $releaseParams.SkipVersionSync = $false
} else {
    $releaseParams.Increment = $true
}

& (Join-Path $PSScriptRoot "build-release.ps1") @releaseParams
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }