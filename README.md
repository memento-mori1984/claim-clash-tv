# Claim Clash

**Claim Clash** is a desktop app for structured, evidence-based fact-finding between opposing perspectives (Blue vs Red). It uses multiple AI providers (Gemini, OpenAI, Anthropic, Groq, OpenRouter, and Grok) and includes a "Cast to TV" feature for smart TVs.

This project was built with **Tauri 2** (Rust backend + webview) wrapping the original single-file HTML/JS game.

## Security & Trust Notice

> **We do not distribute pre-built executables.**

Pre-built `.exe` files are inherently untrusted (unsigned binaries, no code signing, easy to tamper with during transfer). 

**Recommended way to get the app:**

1. Clone the repository yourself.
2. Build it locally following the instructions below.
3. Inspect the source code (the main game logic lives in `src/index.html` and is straightforward to review).

This approach gives you full transparency and reproducibility.

### Why this matters
- Windows will flag unsigned executables.
- Passing around `.exe` files via chat or downloads carries real risk.
- Building from source lets you verify exactly what you're running.

## Prerequisites (Windows)

- [Node.js](https://nodejs.org/) (LTS recommended)
- Rust toolchain (via [rustup](https://rustup.rs/))
- Visual Studio Build Tools (C++ workload) or Visual Studio with C++ tools (required for Tauri/Rust on Windows)

After installing the above, open a **new** PowerShell or Command Prompt and run:

```powershell
rustup update
```

## Build from Source (Recommended)

```powershell
# 1. Clone the repo
git clone https://github.com/user/claim-clash-tv.git
cd claim-clash-tv

# 2. Install dependencies
npm install

# 3. Build the release executable
npm run tauri build
```

The built portable executable will be located at:

```
src-tauri/target/release/claim-clash-tv.exe
```

You can copy this file anywhere (e.g. `C:\Users\You\ClaimClash\Claim Clash.exe`).

### Generate a Checksum (for verification)

After building, generate a SHA-256 hash so others (or you) can verify the binary wasn't modified:

```powershell
# In the project root, after build
Get-FileHash -Algorithm SHA256 "src-tauri\target\release\claim-clash-tv.exe" | Select-Object Hash, Path
```

Example output:
```
Hash : A1B2C3D4E5F6... (full hash)
Path : ...
```

Share the hash alongside any copy you make for others.

### Clean Release Artifacts

Running `.\build-with-checksum.ps1` (or the manual steps above) will also create clean release files in the `dist/` folder:

- `Claim Clash 0.1.0.exe`
- `Claim Clash 0.1.0.exe.sha256`

These use the proper product name and are suitable for distribution when necessary (still strongly prefer source builds).

## Development

```powershell
npm install
npm run tauri dev     # Live development mode (hot reload)
npm run tauri build   # Production build
```

## Project Structure

- `src/index.html`: Main UI + all game logic (Tailwind + vanilla JS)
- `src-tauri/`: Tauri configuration and Rust backend (Cast to TV server, etc.)
- `src/`: Assets, rules PDF, and logos

Most of the application logic is in the single HTML file, making it relatively easy to audit.

## Features

- Blue/Red turn-based questioning of AI
- Multi-AI comparison (toggle Gemini, OpenAI, Anthropic, Groq, OpenRouter, Grok)
- API keys stored only in localStorage (never baked into the build)
- Jailbreak mode toggle
- Bookmark concerns
- Rules reference modals
- Cast to Smart TV (local HTTP server + QR code)
- Clean builds with no embedded keys

## Version

Current version: see `package.json` and `version.json` (currently 0.1.86 Beta).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright © 2026 Zachary H. Roberts. All rights reserved.

"Claim Clash" is a trademark of Zachary H. Roberts.

## Recommended IDE

- VS Code + Tauri extension + rust-analyzer

---

**Built from source is the only supported distribution method.** If someone sends you a pre-built `.exe`, treat it with the same caution as any unknown executable.
