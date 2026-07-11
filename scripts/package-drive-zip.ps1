# Package the current Claim Clash build for tester distribution (Drive upload).
#
# Creates: Claim Clash {version} {phase} - Drive.zip
# Contents: portable exe, .sha256 checksum, HOW-TO-TEST.txt, HOW-TO-INSTALL.txt,
#           Install/Uninstall scripts, TROUBLESHOOTING.txt, ALPHA-TESTER-AGREEMENT.txt, CHANGE LOGS.txt
# Creator-only (not in zip): MARKETING-NOTES.txt at project root
#
# Usage (from project root):
#   .\scripts\package-drive-zip.ps1
#   .\scripts\package-drive-zip.ps1 -OutputDir "C:\Users\Ranzh\ClaimClash"

param(
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$ver = Get-Content (Join-Path $root "version.json") -Raw | ConvertFrom-Json
$version = "{0}.{1}.{2}" -f $ver.major, $ver.minor, $ver.iteration
$phase = if ($ver.phase) { $ver.phase.Trim() } else { "" }
$suffix = if ($phase) { " $phase" } else { "" }
$feedbackEmail = if ($ver.feedbackEmail) { $ver.feedbackEmail } else { "feedback@claim-clash.com" }

$exeName = "Claim Clash $version$suffix.exe"
$shaName = "$exeName.sha256"
$setupName = "Claim Clash $version$suffix - Setup.exe"
$setupShaName = "$setupName.sha256"
$zipName = "Claim Clash $version$suffix - Drive.zip"
$distDir = Join-Path $root "dist"
$exePath = Join-Path $distDir $exeName
$shaPath = Join-Path $distDir $shaName
$setupPath = Join-Path $distDir $setupName
$setupShaPath = Join-Path $distDir $setupShaName

if (-not (Test-Path $exePath)) {
    Write-Error "Missing build at $exePath. Run .\build-with-checksum.ps1 first."
}

$staging = Join-Path $env:TEMP "claim-clash-drive-package-$version"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

Copy-Item $exePath (Join-Path $staging $exeName) -Force
if (Test-Path $shaPath) {
    Copy-Item $shaPath (Join-Path $staging $shaName) -Force
}
if (Test-Path $setupPath) {
    Copy-Item $setupPath (Join-Path $staging $setupName) -Force
    if (Test-Path $setupShaPath) {
        Copy-Item $setupShaPath (Join-Path $staging $setupShaName) -Force
    }
}

$howTo = @"
Claim Clash - Beta Test Build (Windows)
========================================

Copyright (c) 2026 Arcana Veritas LLC. All rights reserved.

Thank you for testing!

INSTALL (RECOMMENDED)
---------------------
See HOW-TO-INSTALL.txt. Use the NSIS Setup installer when included in this zip.
Otherwise run Install Claim Clash.ps1 for a Start Menu shortcut.

QUICK START (PORTABLE)
----------------------
1. Extract this zip to any folder (e.g. Desktop\Claim Clash). Do not run from inside the zip.
2. Read ALPHA-TESTER-AGREEMENT.txt before running the app.
3. Double-click: $exeName
4. If Windows SmartScreen appears (unsigned app), click "More info" then "Run anyway".
5. If nothing happens when you double-click, open TROUBLESHOOTING.txt and follow the steps.
6. On the Get started screen, add at least one of your own API keys (Gemini, Groq, OpenRouter, etc.). Use Shrink (top-right) to window the app while you copy/paste keys from another app.
7. Click Next for a short rules walkthrough, then Start Claim Clash. Preloaded example questions are fine to explore via Load Example (rule of 2: click 1 = stock example; click 2 = today's current events question).

APP WILL NOT OPEN?
------------------
See TROUBLESHOOTING.txt in this zip. Common fixes:
  - Extract the zip first (do not run from inside the zip file).
  - SmartScreen: More info, then Run anyway.
  - Right-click the .exe, Properties, check Unblock if shown.
  - Install Microsoft WebView2: https://go.microsoft.com/fwlink/p/?LinkId=2124703

HOW TO PLAY (SHORT): BUILT FOR TWO
-----------------------------------
Claim Clash is designed for two people at one screen. Bring a partner when you can.

- Sit together. Pick Team A or Team B to go first.
- Type a question, then click Ask.
- The other player clicks Follow Up to take their turn.
- Keep alternating. Steelman the other side's strongest argument when you can.
- Use Cast to TV so you both can read answers on a bigger screen (same Wi-Fi).
- Use Load Example for sample questions (rule of 2: click 1 = stock example; click 2 = today's current events question, once per session).
- Solo mode is optional if you are testing alone.

Settings, bookmarks, and session reset:
- Use Settings (top right) to add more AI keys or change your primary AI.
- Use Bookmark Concern to save topics for later.
- Use Start New Session to reset primary AI memory for a fresh round.
- Use Save & Quit when you are done. Saves to Documents\Claim Clash\ and closes cleanly.

WHAT TO TEST (PLEASE EXPLORE)
-----------------------------
Menus and wording
  - Welcome screen, Settings, About, Rules, toolbar labels, and button text.
  - Note anything confusing or hard to read.

Core functions (two players)
  - Sit together: Ask, Follow Up, bookmarks, session reset, and Load Example.
  - Note whether playing with a partner felt natural. Solo mode is secondary.

AI comparison
  - Toggle other AIs and use Query Selected. Try Analyze Differences for a primary-AI comparison summary.

Cast to TV
  - Same Wi-Fi: start Cast on the PC, open the URL on a TV or phone browser.
  - Ask a question on the PC and confirm the cast view updates.

REQUIREMENTS
------------
- Windows 10 or 11
- Internet connection (the app calls AI services online)
- Your API keys stay on your computer only (saved in local storage)

API KEYS
--------
This beta zip contains the official build (no embedded API keys). Bring your own keys from Google AI Studio, Groq, OpenRouter, or similar free-tier providers.

WHEN YOU FINISH
---------------
- Send feedback through the app first (see Feedback below).
- Delete this zip, the extracted folder, and the app executable from your PC when asked.
- Do not share your personal API keys with anyone else.

FEEDBACK (PLEASE USE THE APP)
-----------------------------
Prefer the built-in feedback form over writing a separate email from scratch.
Use either path:
- Welcome screen: Send Alpha Tester Feedback
- Main screen: Feedback button in the top toolbar (same form)
Fill in the form, then choose your email provider. The To field and subject are pre-filled.
If the form will not open your email, you may email: $feedbackEmail

Version: $version$suffix
"@

$howToPath = Join-Path $staging "HOW-TO-TEST.txt"
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($howToPath, $howTo, $utf8)

$agreementTemplate = Join-Path $root "distribution\ALPHA-TESTER-AGREEMENT.txt"
if (-not (Test-Path $agreementTemplate)) {
    Write-Error "Missing agreement template at $agreementTemplate"
}
$agreement = [System.IO.File]::ReadAllText($agreementTemplate) `
    -replace '\{\{VERSION\}\}', "$version$suffix" `
    -replace '\{\{FEEDBACK_EMAIL\}\}', $feedbackEmail
[System.IO.File]::WriteAllText((Join-Path $staging "ALPHA-TESTER-AGREEMENT.txt"), $agreement, $utf8)
$changeLogs = Join-Path $root "CHANGE LOGS.txt"
if (Test-Path $changeLogs) {
    Copy-Item $changeLogs (Join-Path $staging "CHANGE LOGS.txt") -Force
}

$troubleshootingTemplate = Join-Path $root "distribution\TROUBLESHOOTING.txt"
if (Test-Path $troubleshootingTemplate) {
    $troubleshooting = [System.IO.File]::ReadAllText($troubleshootingTemplate) `
        -replace '\{\{VERSION\}\}', "$version$suffix"
    [System.IO.File]::WriteAllText((Join-Path $staging "TROUBLESHOOTING.txt"), $troubleshooting, $utf8)
}

$installHowToTemplate = Join-Path $root "distribution\HOW-TO-INSTALL.txt"
if (Test-Path $installHowToTemplate) {
    $installHowTo = [System.IO.File]::ReadAllText($installHowToTemplate) `
        -replace '\{\{VERSION\}\}', "$version$suffix"
    [System.IO.File]::WriteAllText((Join-Path $staging "HOW-TO-INSTALL.txt"), $installHowTo, $utf8)
}

$installScript = Join-Path $root "scripts\install-claim-clash.ps1"
$uninstallScript = Join-Path $root "scripts\uninstall-claim-clash.ps1"
if (Test-Path $installScript) {
    Copy-Item $installScript (Join-Path $staging "Install Claim Clash.ps1") -Force
}
$pathsScript = Join-Path $root "scripts\show-claim-clash-paths.ps1"
if (Test-Path $pathsScript) {
    Copy-Item $pathsScript (Join-Path $staging "Show Claim Clash Paths.ps1") -Force
}
$rootInstall = Join-Path $root "Install-Claim-Clash.ps1"
if (Test-Path $rootInstall) {
    Copy-Item $rootInstall (Join-Path $staging "Install-Claim-Clash.ps1") -Force
}
if (Test-Path $uninstallScript) {
    Copy-Item $uninstallScript (Join-Path $staging "Uninstall Claim Clash.ps1") -Force
}


$channels = & (Join-Path $PSScriptRoot "resolve-alpha-channels.ps1")
$destDirs = @($distDir, $channels.ActiveClaimClashDir)
if ($channels.IsPostBaseline) {
    $destDirs += $channels.OneDriveDevDir
} else {
    $destDirs += "C:\Users\Ranzh\OneDrive"
}
if ($OutputDir) { $destDirs = @($OutputDir) + $destDirs }

$created = @()
foreach ($dir in ($destDirs | Select-Object -Unique)) {
    if (-not $dir) { continue }
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $zipPath = Join-Path $dir $zipName
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -Force
    $created += $zipPath
}

Remove-Item $staging -Recurse -Force

Write-Host "Packaged: $zipName" -ForegroundColor Green
$created | ForEach-Object { Write-Host "  $_" }