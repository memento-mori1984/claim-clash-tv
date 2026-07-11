# Claim Clash Privacy Policy

**Effective date:** June 27, 2026  
**Last updated:** July 8, 2026

Arcana Veritas LLC ("we," "us," or "the developer") operates **Claim Clash**, a desktop application for structured, evidence-based fact-finding between opposing perspectives.

This policy explains what data the app touches, where it goes, and what we do **not** collect.

---

## Summary

- Claim Clash does **not** run developer-controlled servers that receive your game content, API keys, or AI conversations.
- API keys and most app settings stay on **your device** (browser localStorage inside the app webview).
- When you click **Ask**, your question is sent **directly from your device** to the AI provider you configured (for example Google Gemini, OpenAI, Anthropic, Groq, OpenRouter, or xAI Grok), using **your** API key.
- Session exports and backups are saved **locally** on your PC unless you choose to email or upload them yourself.
- We do **not** use analytics, advertising trackers, or crash-reporting services controlled by the developer.

---

## Information stored on your device

The app may store the following locally:

| Data | Where | Purpose |
|------|--------|---------|
| AI provider API keys | localStorage | So you do not re-enter keys each launch |
| Game preferences (primary AI, bookmarks, rules skip flags, etc.) | localStorage | App settings and session state |
| Brain background question pool and daily question | localStorage | Preloaded example questions (Brain subsystem) |
| Alpha tester agreement acceptance | localStorage | Optional alpha build gate |
| Exported session files | `Documents\Claim Clash Sessions\` | Backups and Past Sessions recall |

We do not automatically upload this data to developer servers.

---

## Information sent over the network

When you use features that require the internet, data leaves your device as follows:

### AI providers (your choice)

If you enter an API key and click **Ask**, **Bookmark**, **Compare**, or related actions, the app sends your question text (plain text), conversation context, and bookmarks to the provider you selected. That transmission goes **directly** to that provider's API endpoints, not through servers operated by Claim Clash.

Each provider has its own privacy policy and terms. You are responsible for reviewing those policies before use.

### Brain daily questions (creator-signed feed)

The hidden Brain background component may fetch a **creator-signed JSON feed** over HTTPS to load a daily example question and optional question pool. The app verifies an Ed25519 signature in the Rust backend before accepting any Brain content. This feed is published only by the Claim Clash author; your game content is not sent to that feed request.

### Cast to TV (local network)

Cast to TV starts a small HTTP server bound to your **local network IP** so a TV or phone on the same Wi‑Fi can mirror game state. This traffic stays on your LAN. A random pairing token is required to read cast state.

### Opening links

Setup screens and email export may open provider billing pages, webmail compose windows, or Grok in your browser. Those services are third parties outside this app.

### Feedback (optional)

If you use the in-app **Feedback** form and send email, **you** choose what to send and which mail provider to use. Feedback is not transmitted to us automatically.

---

## Information we do not collect

We do **not**:

- Operate accounts or login systems for Claim Clash
- Collect names, emails, or contact details unless you voluntarily send feedback
- Sell or rent personal data
- Run developer-controlled telemetry, analytics, or advertising SDKs inside the app
- Receive your API keys on any server we operate

---

## Children's privacy

Claim Clash is not directed at children under 13. We do not knowingly collect personal information from children.

---

## Data retention and deletion

- **localStorage:** Clear app data by removing keys in Settings or uninstalling the app. Alpha builds may also offer a clean-start path on launch.
- **Session exports:** Delete files in `Documents\Claim Clash Sessions\` at any time.
- **Third-party AI providers:** Retention is governed by each provider's policies and your account settings with them.

---

## Security

- Release and Microsoft Store builds do not embed API keys in source.
- API keys are stored only in localStorage on your device.
- Cast to TV requires a pairing token and binds to your LAN IP rather than all network interfaces.

No method of transmission or storage is 100% secure. Use strong, provider-specific API keys and revoke keys you no longer need.

---

## Microsoft Store

If you install Claim Clash from the Microsoft Store, Microsoft may collect installation and store-related data under [Microsoft's privacy statement](https://privacy.microsoft.com/). That collection is separate from this app.

---

## Changes to this policy

We may update this policy when the app changes. The **Last updated** date at the top will change when we do. Material changes for Store listings will be reflected in Partner Center.

---

## Contact

Questions about this policy or Claim Clash privacy practices:

**Email:** feedback@claim-clash.com

---

Copyright © 2026 Arcana Veritas LLC. All rights reserved.  
"Claim Clash" is a trademark of Arcana Veritas LLC.