# Opens Google Apps Script and copies create-gmail-drafts.gs to clipboard.
# Run from project root: .\scripts\Create-GmailDrafts.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$gsPath = Join-Path $PSScriptRoot 'create-gmail-drafts.gs'

if (-not (Test-Path $gsPath)) {
    Write-Error "Missing $gsPath"
}

$script = Get-Content $gsPath -Raw -Encoding UTF8
Set-Clipboard -Value $script

Write-Host ''
Write-Host 'Claim Clash — Gmail drafts helper' -ForegroundColor Cyan
Write-Host '==================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Script copied to clipboard.' -ForegroundColor Green
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Browser opening script.google.com'
Write-Host '  2. Click New project'
Write-Host '  3. Delete default code, paste (Ctrl+V)'
Write-Host '  4. Save project name: Claim Clash Drafts'
Write-Host '  5. Select function: createClaimClashDrafts'
Write-Host '  6. Click Run → authorize Gmail'
Write-Host '  7. Gmail → Drafts — 10 templates appear'
Write-Host '  8. On each draft: replace add-recipient@example.com with real contact'
Write-Host '  9. Personalize [BRACKETS], remove [CC Draft] from subject before sending'
Write-Host ''
Write-Host 'Re-run the script anytime; it removes old [CC Draft] drafts first.'
Write-Host ''

Start-Process 'https://script.google.com/home/projects/create'