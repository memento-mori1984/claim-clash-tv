# Security Policy & Verification

Copyright (c) 2026 Zachary H. Roberts. All rights reserved.
"Claim Clash" is a trademark of Zachary H. Roberts.

## Distribution Model

**Claim Clash does not distribute pre-built binaries through any channel.**

All users are expected to:

1. Clone the repository from the official source.
2. Review the code (especially `src/index.html`).
3. Build the application themselves using the instructions in the README.

This eliminates the risk of tampered executables during download or transfer.

## Why No Prebuilts?

- Native Windows executables without code signing will trigger security warnings.
- Files passed via chat, email, or direct download have no provenance.
- Building from source gives reviewers full auditability and reproducible results.

## Verifying a Build

After running `npm run tauri build`, generate a checksum:

```powershell
Get-FileHash -Algorithm SHA256 "src-tauri\target\release\claim-clash-tv.exe"
```

Compare the resulting hash against a known good value if someone shares one (only trust hashes from the official repository or trusted parties who built from source).

A helper script is provided:

```powershell
.\build-with-checksum.ps1
```

This produces both the executable and a `.sha256` sidecar file.

## API Keys

- All API keys (Gemini, OpenAI, Anthropic, etc.) are stored **only** in your browser's `localStorage`.
- They are never sent to any server controlled by this project.
- Clean builds explicitly clear any previously saved keys.
- Never share builds that contain real API keys.

## Reporting Issues

If you discover a security vulnerability, please open an issue or contact the maintainer privately. Do not disclose publicly until a fix is available.

## Additional Notes

- The Cast to TV feature runs a local HTTP server on a random port (no external exposure by default).
- The application makes direct client-side calls to third-party AI APIs using keys you provide.
- Tauri uses the system's native webview, reducing the bundled runtime attack surface compared to some other frameworks.
