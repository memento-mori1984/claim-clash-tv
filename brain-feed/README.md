# Claim Clash Brain Feed (creator-signed)

The Brain background subsystem loads **daily questions and pool updates** from a creator-signed HTTPS JSON feed. The desktop app verifies an Ed25519 signature in Rust before accepting any content.

Users cannot author Brain questions locally or via localStorage tampering — only the creator's signing key can publish feed updates.

## Files

| File | Purpose |
|------|---------|
| `draft.json` | Unsigned template you edit before signing |
| `feed.json` | Signed feed hosted at a public HTTPS URL |
| `public.key.hex` | Public key embedded in the app (safe to commit) |
| `private.key.pem` | **Never commit** — used only to sign feeds |

## One-time setup

```powershell
node scripts/generate-brain-keys.mjs
```

Copy the public key hex into `version.json` → `brainVerifyPublicKeyHex`.

Set `version.json` → `brainFeedUrl` to the HTTPS URL where you host `feed.json` (for example a GitHub raw URL after push).

Run `.\scripts\sync-version.ps1` to regenerate `src-tauri/src/brain_config.rs`.

## Publish a daily feed

### Option A — craft from today's headlines (recommended)

The click-2 **current events question** must feel like a push alert from the **last 24 to 48 hours**: breaking news, or a **new development** in an ongoing case (filing, ruling, vote, arrest, etc.).

On a **slow news day** (few fresh headlines), the craft script falls back to an **obviously ridiculous** claim no player would seriously believe (still fact-checkable and playful).

After click 2 (Rule of 2), **Load Example** shuffles stock examples together with **past** current-events questions from the signed `pool` array (today's question is excluded). Each daily craft run **accumulates** prior `pool` entries from `feed.json` (up to 300).

```powershell
# Requires GEMINI_API_KEY or scripts/alpha-keys.local.json
node scripts/craft-current-events-question.mjs
node scripts/sign-brain-feed.mjs
```

Review `draft.json` before signing. `headline_seed` is creator metadata only (not signed into `feed.json`).

### Option B — edit by hand

1. Edit `brain-feed/draft.json` (`date`, `daily`, optional `pool` array).
2. Sign:

```powershell
node scripts/sign-brain-feed.mjs
```

3. Upload `brain-feed/feed.json` to your host (same URL as `brainFeedUrl`).
4. Rebuild the app so testers pick up URL/key changes if needed.

## Feed format

```json
{
  "v": 1,
  "date": "2026-06-27",
  "daily": "One evidence-based question ending with ?",
  "pool": [{ "text": "...", "date": "2026-06-27" }],
  "issued_at": 1750982400,
  "sig": "base64 Ed25519 signature"
}
```

## Security notes

- Private key stays offline on the creator machine only.
- Empty `brainFeedUrl` or public key disables server Brain (Load Example Flow skips the Brain turn silently).
- Client-side RSS + user-API Brain generation was removed in 0.1.78; only signed feeds are trusted.