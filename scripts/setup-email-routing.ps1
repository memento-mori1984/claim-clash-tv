# Cloudflare Email Routing for claim-clash.com.
# Run after destination inboxes are verified: .\scripts\setup-email-routing.ps1

$ErrorActionPreference = "Stop"
$Domain = "claim-clash.com"
$OwnerInbox = "claimsclash@gmail.com"
$FeedbackInbox = "ClaimsClashFeedback@gmail.com"
$WorkersDir = Join-Path $PSScriptRoot "..\workers"

Set-Location $WorkersDir

Write-Host "Destination addresses (must be verified):" -ForegroundColor Cyan
npx wrangler email routing addresses list

function Set-ForwardRule {
    param(
        [string]$RuleId,
        [string]$Name,
        [string]$Address,
        [string]$Inbox
    )
    Write-Host "$Address -> $Inbox" -ForegroundColor Cyan
    npx wrangler email routing rules update $Domain $RuleId `
        --name $Name `
        --match-type literal `
        --match-field to `
        --match-value $Address `
        --action-type forward `
        --action-value $Inbox
}

Set-ForwardRule "f0f0695e97e34a1eaf41e33f3a59e59a" "Owner"    "owner@$Domain"    $OwnerInbox
Set-ForwardRule "1e8bb4c3e509470a8f25006ced97cd24" "Feedback" "feedback@$Domain" $FeedbackInbox
Set-ForwardRule "be83f824553940eb829e3b2a5b028834" "Support"  "support@$Domain"  $FeedbackInbox
Set-ForwardRule "1f12cf9a66844d84bc650f3eed171ec2" "Hello"    "hello@$Domain"    $FeedbackInbox

Write-Host "Catch-all -> $FeedbackInbox" -ForegroundColor Cyan
npx wrangler email routing rules update $Domain catch-all `
    --enabled true `
    --action-type forward `
    --action-value $FeedbackInbox

Write-Host "`nActive rules:" -ForegroundColor Green
npx wrangler email routing rules list $Domain