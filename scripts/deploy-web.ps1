# Build web-dist and deploy password-gated Claim Clash to Cloudflare Workers.
#
# Usage:
#   .\scripts\deploy-web.ps1
#   .\scripts\deploy-web.ps1 -SkipDeploy        # build only
#   .\scripts\deploy-web.ps1 -NoTestingKeys     # Release profile (testers bring own keys)

param(
    [switch]$SkipDeploy,
    [switch]$NoTestingKeys
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$workersDir = Join-Path $root "workers"
$wranglerToml = Join-Path $workersDir "wrangler.toml"

Write-Host "=== Claim Clash Web Deploy ===" -ForegroundColor Cyan

$buildArgs = @{}
if (-not $NoTestingKeys) { $buildArgs['WithTestingKeys'] = $true }
& (Join-Path $PSScriptRoot "build-web.ps1") @buildArgs

$consumerSetup = Join-Path $root "web-dist\download\Claim-Clash-Setup.exe"
$consumerPortable = Join-Path $root "web-dist\download\Claim-Clash-Portable.exe"
if (-not (Test-Path $consumerSetup) -and -not (Test-Path $consumerPortable)) {
    Write-Host "`nNote: No consumer Windows build in web-dist/download yet." -ForegroundColor Yellow
    Write-Host "  Run .\build-with-checksum.ps1 (Release), then .\scripts\deploy-web.ps1 again." -ForegroundColor Yellow
}

$webDist = Join-Path $root "web-dist"
$indexHtml = Join-Path $webDist "index.html"
if (-not (Test-Path $indexHtml)) {
    Write-Error "web-dist\index.html is missing. Stop any local 'wrangler dev' session, then run deploy again."
}
$assetCount = (Get-ChildItem $webDist -Recurse -File -ErrorAction Stop | Measure-Object).Count
if ($assetCount -lt 10) {
    Write-Error "web-dist looks incomplete ($assetCount files). Aborting deploy to avoid a blank site after login."
}

if ($SkipDeploy) {
    Write-Host "`nBuild only (-SkipDeploy). Skipping wrangler deploy." -ForegroundColor Yellow
    exit 0
}

if (-not (Test-Path $wranglerToml)) {
    Write-Error "Missing workers/wrangler.toml"
}

$toml = Get-Content $wranglerToml -Raw
if ($toml -match 'REPLACE_WITH_YOUR_KV_NAMESPACE_ID') {
    Write-Host "`nBefore deploy, set your KV namespace id in workers/wrangler.toml" -ForegroundColor Red
    Write-Host "  npx wrangler kv namespace create claim-clash-rate-limit" -ForegroundColor Yellow
    Write-Host "Also set secrets: DEV_PASSWORD_CREDENTIAL and SESSION_SECRET" -ForegroundColor Yellow
    Write-Host "  node scripts/hash-web-dev-password.mjs `"YourPassword`"" -ForegroundColor Yellow
    Write-Host "See workers/DEPLOY.txt for full steps." -ForegroundColor Yellow
    exit 1
}

Push-Location $workersDir
try {
    Write-Host "`nDeploying to Cloudflare Workers..." -ForegroundColor Cyan
    npx --yes wrangler deploy
    if ($LASTEXITCODE -ne 0) {
        throw "wrangler deploy failed with exit code $LASTEXITCODE"
    }
    Write-Host "`nDeploy complete." -ForegroundColor Green
    Write-Host "Attach claim-clash.com and claims-clash.com in Cloudflare Workers if not already routed." -ForegroundColor Yellow
    Write-Host "See workers/DEPLOY.txt for domain and password setup." -ForegroundColor Yellow
} finally {
    Pop-Location
}