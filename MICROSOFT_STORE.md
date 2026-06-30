# Microsoft Store Submission Guide for Claim Clash

This document tracks publishing Claim Clash to the Microsoft Store.

**Preferred path:** native **MSIX** via [winapp CLI](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/tauri). Microsoft re-signs MSIX after certification (no purchased cert required for Store upload).

**Legacy path:** signed **MSI** installer linked in Partner Center (you sign the MSI yourself). See "MSI fallback" below.

## Current Status

- [x] Step 0: MSIX manifest + `scripts/build-msix-store.ps1` scaffolded (`msix/`)
- [ ] Step 1: Enroll as Microsoft Developer
- [ ] Step 2: Reserve app name in Partner Center (MSIX product)
- [ ] Step 3: Host privacy policy at a public HTTPS URL
- [ ] Step 4: Build Release MSIX and verify locally (`msix/MSIX-TESTING.txt`)
- [ ] Step 5: Declare capabilities in Partner Center
- [ ] Step 6: Prepare Store listing (screenshots, description)
- [ ] Step 7: Submit MSIX to Partner Center

## Step 1 — Developer enrollment

1. Sign in with a Microsoft account at [Microsoft Store developer enrollment](https://developer.microsoft.com/en-us/microsoft-store/register).
2. Complete identity verification and pay the one-time registration fee (if applicable).
3. Open [Partner Center — Apps and games](https://partner.microsoft.com/dashboard/apps-and-games/overview).

## Step 2 — Reserve the app name

1. Click **New product** → **EXE or MSI app**.
2. Reserve a unique name (for example **Claim Clash**).
3. Note your **Package/Identity Name** and **Publisher** display name for manifest fields.

## Step 3 — Privacy policy (required)

The Store **requires** a privacy policy URL because Claim Clash:

- Makes network calls to third-party AI APIs
- Fetches public news RSS for the Brain background subsystem
- Runs a local Cast-to-TV HTTP server on your LAN

**In this repository:**

- Full policy: [PRIVACY-POLICY.md](PRIVACY-POLICY.md)
- Tester/distribution copy: [distribution/PRIVACY-POLICY.txt](distribution/PRIVACY-POLICY.txt)

**Before submission:**

1. Host `PRIVACY-POLICY.md` at a stable public **HTTPS** URL (GitHub blob/raw URL, your website, etc.).
2. Set that URL in `version.json` → `privacyPolicyUrl`.
3. Set the same URL in `src-tauri/tauri.store.conf.json` → `bundle.homepage`.
4. Enter the URL in Partner Center under **Product declarations → Privacy policy**.

## Step 4 — Build the Store MSIX (recommended)

Prerequisites: `winget install Microsoft.WinAppCli`

```powershell
.\scripts\build-msix-store.ps1 -NoIncrement
```

Output: `dist\Claim Clash {version}.0 Store.msix`

Local install (first time, admin):

```powershell
.\scripts\build-msix-store.ps1 -InstallDevCert
Add-AppxPackage -Path "dist\Claim Clash 0.1.82.0 Store.msix"
```

Verify Cast, session saves, and export using `msix/MSIX-TESTING.txt` before Partner Center upload.

Manifest: `msix/Package.appxmanifest` (capabilities: `internetClient`, `privateNetworkClientServer`, `runFullTrust`).

### MSI fallback (older Tauri Store workflow)

Tauri v2 does **not** emit a native `.msix` bundle from `tauri bundle` alone. The Microsoft Store also accepts a **signed offline MSI** that Partner Center wraps into MSIX.

Store-specific settings live in `src-tauri/tauri.store.conf.json`:

- **Target:** `msi` (not `msix`)
- **WebView2:** `offlineInstaller` (required for Store offline install)
- **Profile:** Release (no embedded API keys) via `scripts/build-store.ps1`

### Build command

```powershell
.\scripts\build-store.ps1
```

Output: `dist\Claim Clash {version} {phase} Store.msi` plus `.sha256` sidecar.

### Code signing

Store submission requires a **code-signed** installer. See [Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/) and your certificate provider (EV cert recommended for immediate SmartScreen trust).

### Silent install (required)

When registering the MSI in Partner Center, set the silent install argument:

| Installer | Silent argument |
|-----------|-----------------|
| MSI (this project) | `/quiet` |
| NSIS `-setup.exe` (non-Store builds) | `/S` |

## Step 5 — Capabilities (Partner Center)

Declare these capabilities when packaging/linking the Win32 app in Partner Center:

| Capability | Why Claim Clash needs it |
|------------|--------------------------|
| **internetClient** | AI API calls, Google News RSS (Brain), opening provider/mail URLs |
| **privateNetworkClientServer** | Cast to TV local HTTP server on LAN IP |

Cast binds to your LAN address only (not `0.0.0.0`) and requires an 8-character pairing token for `/state` and mirror assets.

No broad `runFullTrust` declaration should be needed beyond standard packaged-desktop defaults if you use the EXE/MSI workflow.

## Step 6 — Store listing

Prepare in Partner Center:

- **Description** — Structured fact-finding game using AI providers the user configures
- **Screenshots** — Main game, Settings, Cast modal, About (shows privacy link)
- **Category** — Entertainment or Education (your choice)
- **Privacy policy URL** — From Step 3
- **Support contact** — ClaimsClashFeedback@gmail.com

Release builds hide alpha-only UI (pre-filled keys, alpha agreement). Store users bring their own API keys.

## Step 7 — Submit

1. Upload the signed MSI (or link per Partner Center EXE/MSI workflow).
2. Complete age ratings and export compliance questionnaires.
3. Submit for certification.

Certification may flag:

- Network use without privacy policy → fixed by Step 3
- Non-silent installer → use `/quiet` for MSI
- Unsigned binary → fixed by code signing

## Helper commands

| Command | Purpose |
|---------|---------|
| `.\scripts\build-store.ps1` | Release MSI for Microsoft Store |
| `.\scripts\build-release.ps1` | Portable NSIS/exe for direct distribution |
| `npm run tauri:store` | Raw Tauri bundle with `tauri.store.conf.json` |

## Important notes

- Use `src-tauri/tauri.store.conf.json` only for Store bundles; normal alpha testing uses `build-with-checksum.ps1`.
- Ensure `privacyPolicyUrl` in `version.json` and `homepage` in `tauri.store.conf.json` point at your hosted privacy policy before submission.
- Copyright and trademark notices: [NOTICE](NOTICE), [LICENSE](LICENSE), About modal in the app.

## References

- [Tauri — Microsoft Store](https://v2.tauri.app/distribute/microsoft-store/)
- [Tauri — Windows installer](https://v2.tauri.app/distribute/windows-installer/)
- [Microsoft — Publish Windows apps](https://learn.microsoft.com/en-us/windows/apps/publish/)
- [Microsoft — Win32 MSI silent install](https://learn.microsoft.com/en-us/windows/uwp/publish/msiexe/provide-package-details)