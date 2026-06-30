# Claim Clash: Agent / Contributor Rules

## User-facing copy (required)

### No em dashes

**Never use em dashes (—) or en dashes (–) in user-facing text.**

This includes all in-app UI (`src/index.html`), tester packages (`distribution/*.txt`), export filenames shown to users, and installer copy.

**Use instead:**

| Instead of | Use |
|------------|-----|
| Em dash between clauses | Period, comma, colon, or parentheses |
| `Green — API reachable` | `Green: API reachable` |
| `OPTION A — Install` | `OPTION A: Install` |
| Parenthetical aside | Commas or parentheses |

Regular hyphens in compound words (`pay-as-you-go`, `Save-and-Quit`) are fine.

**Check before shipping:**

```powershell
Select-String -Path src\index.html,src\brain.js,src\grade-level.js,distribution\*.txt -Pattern '[\u2013\u2014]'
```

Any match in user-facing files should be fixed before release.

### Paid-plan wording

Use **recommend**, not “strongly use”:

- Good: `We strongly recommend a paid Gemini API plan for your primary AI.`
- Bad: `Strongly use a paid Gemini API plan for your primary AI.`

---

## Opening flow (product guidance)

**Current first-launch path (4 layers):**

1. Alpha tester agreement (full-screen modal)
2. Welcome / setup (long scroll: pitch, grade level, 6 AI rows, two dot legends, paid-plan banners)
3. Rules walkthrough (**10** screens)
4. Main game

**Consolidation recommendations (preferred direction):**

| Priority | Change | Why |
|----------|--------|-----|
| 1 | **One “Get started” screen** instead of agreement + full welcome scroll | Agreement checkbox + one short pitch + API keys only; link “Full agreement” |
| 2 | **Cut rules walkthrough to 4 screens** | Merge: intro+how, steelman+core, play tips+AI literacy, then Start |
| 3 | **Move Grade Level to Settings only** | Most testers are not classrooms; removes a whole setup section |
| 4 | **Drop duplicate pitch** | “What is Claim Clash?” appears on setup and again in rules intro; keep rules only |
| 5 | **One collapsible “Legend”** for API dots | Replace two inline legend blocks with “What do the colored dots mean?” |
| 6 | **Skip walkthrough on repeat visits** | Default checked after first completion; first screen offers “Skip rules (I’ve played before)” |

**Target first-launch:** Agreement + keys → 4 rule cards (or skip) → play (3 steps max before Ask).

### Proposed 4-screen rules merge (10 → 4)

| New screen | Merges | Keep / cut |
|------------|--------|------------|
| 1. **Welcome to play** | `intro` + `how` | Keep two-player steps (Ask / Follow Up). Cut grade-level paragraph (Settings only). Cut duplicate pitch already on setup hero. |
| 2. **Steelman & core rules** | `steelman` + `core` | One screen for fair argument + numbered rules 1, 3, 4, 7, 8. |
| 3. **During a round** | `challenge` + `focus` + `ending` + `examples` | Short challenge note, bookmark tip, when to end, one mini example. |
| 4. **Ask well & start** | `best` + `tips` | Bullet best practices + "Ready? Pick who goes first." Checkbox: skip rules on next launch. Button: **Start Claim Clash**. |

**Proposed "Get started" screen** (replaces agreement modal + long welcome scroll):

- Collapsed agreement: checkbox "I agree to alpha tester terms" + link to full text
- One-line pitch (reuse setup hero, ~2 sentences)
- API keys block only (no "What is Claim Clash?" section)
- Collapsible "What do the dots mean?" (one legend for status + free tier)
- Primary CTA: **Next: Rules** (or **Start Claim Clash** if rules skip is on)

**Wording to delete outright** (already said elsewhere):

- Setup "What is Claim Clash?" section (lines 181-208 in `index.html`) once rules intro exists
- Rules `intro` paragraphs that repeat setup pitch and grade level
- Second dot legend on setup (fold into one `<details>`)

Creator-only docs (`MARKETING-NOTES.txt`, `OUTREACH-EMAILS.txt`) may keep em dashes; tester and in-app copy may not. AI facilitator blocks (`[FACILITATOR …]` in directives) are not player-visible.