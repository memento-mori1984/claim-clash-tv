# Claim Clash v0.1.86 Beta

**Structured, evidence-based fact-finding between opposing perspectives (Blue vs Red).**

## Highlights

- Multi-AI providers: Gemini, OpenAI, Anthropic, Groq, OpenRouter, Grok
- Turn-based questioning with multi-model comparison
- Cast to Smart TV (LAN pairing + QR code)
- Creator-signed Brain feed for daily example questions
- Release build profile: no embedded API keys
- Security hardening: Cast XSS/pairing, plain-text API payloads, Brain localStorage validation

## Build from source (recommended)

```powershell
git clone https://github.com/user/claim-clash-tv.git
cd claim-clash-tv
npm install
npm run tauri build
```

Portable executable: `src-tauri/target/release/claim-clash-tv.exe`

Verify with SHA-256:

```powershell
Get-FileHash -Algorithm SHA256 "src-tauri\target\release\claim-clash-tv.exe"
```

## Requirements

- Windows 10+ (64-bit)
- Node.js LTS, Rust (rustup), Visual Studio C++ build tools
- Your own API keys (stored locally in the app)

## Privacy

See [PRIVACY-POLICY.md](PRIVACY-POLICY.md). No developer-controlled servers receive your conversations or API keys.

## Full changelog

See [CHANGE LOGS.txt](CHANGE%20LOGS.txt).