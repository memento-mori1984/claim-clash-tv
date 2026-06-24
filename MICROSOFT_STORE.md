# Microsoft Store Submission Guide for Claim Clash

This document tracks the steps to publish Claim Clash to the Microsoft Store.

## Current Status
- [ ] Step 1: Enroll as Microsoft Developer
- [ ] Step 2: Reserve app name in Partner Center
- [ ] Step 3: Configure Tauri for Store (MSIX)
- [ ] Step 4: Add required capabilities (network, local server)
- [ ] Step 5: Build MSIX package
- [ ] Step 6: Prepare Store listing (screenshots, description, privacy policy)
- [ ] Step 7: Submit to Partner Center

## Helper Commands
- Normal build: `npm run tauri build`
- Store build (MSIX focused): `npm run tauri:store`

## Important Notes
- Use `src-tauri/tauri.store.conf.json` for Store-specific settings.
- The Cast to TV feature uses a local HTTP server. This may need special handling in the Store sandbox (privateNetworkClientServer capability + possible localhost-only mode).
- A Privacy Policy is **required** because the app makes network calls to AI providers.
- Copyright notices are embedded in the source and app UI. See [NOTICE](NOTICE), LICENSE, and About modal for details. "Claim Clash" is a trademark of Zachary H. Roberts.

## Next Steps
Follow the numbered steps in order. Update this file as we progress.
