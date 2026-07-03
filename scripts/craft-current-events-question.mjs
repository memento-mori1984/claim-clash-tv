#!/usr/bin/env node
/**
 * Draft today's current-events question for the signed Brain feed.
 * Rule of 2 (click 2): extremely recent breaking news or a fresh development
 * in an ongoing case. On slow news days, drafts an obviously ridiculous claim.
 *
 * Usage:
 *   $env:GEMINI_API_KEY = "AIza..."
 *   node scripts/craft-current-events-question.mjs
 *   node scripts/craft-current-events-question.mjs --date 2026-07-02 --dry-run
 *
 * Reads optional GEMINI_API_KEY from env or scripts/alpha-keys.local.json.
 * Writes brain-feed/draft.json (unsigned). Run sign-brain-feed.mjs next.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRAFT_PATH = path.join(root, 'brain-feed', 'draft.json');
const FEED_PATH = path.join(root, 'brain-feed', 'feed.json');
const POOL_MAX = 300;
const NEWS_RSS = 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const RECENT_HOURS = 36;
const SLOW_NEWS_MIN_RECENT = 4;

function usage() {
    console.error('Usage: node scripts/craft-current-events-question.mjs [--date YYYY-MM-DD] [--dry-run] [--mode breaking|ridiculous]');
    process.exit(1);
}

function parseArgs(argv) {
    const args = { date: null, dryRun: false, mode: null };
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--date') args.date = argv[++i];
        else if (argv[i] === '--dry-run') args.dryRun = true;
        else if (argv[i] === '--mode') args.mode = argv[++i];
        else usage();
    }
    return args;
}

function todayYmd() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function midnightUtcUnix(dateYmd) {
    const [y, m, d] = dateYmd.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 1000);
}

function loadGeminiKey() {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
    const localPath = path.join(root, 'scripts', 'alpha-keys.local.json');
    if (fs.existsSync(localPath)) {
        const keys = JSON.parse(fs.readFileSync(localPath, 'utf8'));
        if (keys.geminiApiKey) return String(keys.geminiApiKey).trim();
    }
    return '';
}

function decodeXml(text) {
    return String(text || '')
        .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
        .replace(/&amp;/g, '&')
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .trim();
}

function parseRssItems(xml) {
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = re.exec(xml)) && items.length < 50) {
        const block = match[1];
        const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
        const pubMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
        const title = decodeXml(titleMatch ? titleMatch[1] : '');
        const pubDate = pubMatch ? new Date(decodeXml(pubMatch[1])) : null;
        if (title) {
            items.push({
                title,
                pubDate: pubDate && !Number.isNaN(pubDate.getTime()) ? pubDate : null
            });
        }
    }
    return items;
}

function headlineAgeHours(item) {
    if (!item.pubDate) return 999;
    return (Date.now() - item.pubDate.getTime()) / (1000 * 60 * 60);
}

function formatHeadlineForPrompt(item, index) {
    const age = headlineAgeHours(item);
    const ageLabel = age >= 999
        ? 'time unknown'
        : age < 1
            ? 'under 1 hour ago'
            : age < 24
                ? `${Math.round(age)} hours ago`
                : `${Math.round(age / 24)} days ago`;
    return `${index + 1}. [${ageLabel}] ${item.title}`;
}

function filterRecentHeadlines(items) {
    const recent = items.filter(item => headlineAgeHours(item) <= RECENT_HOURS);
    return recent.length ? recent : items.slice(0, 12);
}

function detectSlowNewsDay(recentHeadlines) {
    const withTimestamps = recentHeadlines.filter(item => item.pubDate);
    if (withTimestamps.length < SLOW_NEWS_MIN_RECENT) return true;

    const veryFresh = withTimestamps.filter(item => headlineAgeHours(item) <= 18);
    if (veryFresh.length < 2) return true;

    const urgencyPattern = /\b(today|tonight|this morning|just in|breaking|developing|hours ago|minutes ago|arrest|indict|vote|ruled|strikes|killed|resign|announces?|confirmed)\b/i;
    const urgentCount = recentHeadlines.filter(item => urgencyPattern.test(item.title)).length;
    return urgentCount < 2;
}

async function fetchHeadlines() {
    const res = await fetch(NEWS_RSS, {
        headers: { 'User-Agent': 'ClaimClash-BrainFeed/1.0' }
    });
    if (!res.ok) throw new Error(`News RSS failed: ${res.status}`);
    const xml = await res.text();
    const items = parseRssItems(xml);
    if (!items.length) throw new Error('No headlines parsed from RSS');
    return items;
}

async function callGemini(apiKey, prompt) {
    let lastError = 'Gemini request failed';
    for (const model of GEMINI_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.35,
                    maxOutputTokens: 2048,
                    responseMimeType: 'application/json'
                }
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            lastError = data?.error?.message || `HTTP ${res.status} (${model})`;
            continue;
        }
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
        if (text.trim()) return text.trim();
        lastError = `Empty response (${model})`;
    }
    throw new Error(lastError);
}

function extractJsonBlock(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = fenced ? fenced[1] : text;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
        throw new Error(`Model did not return JSON: ${String(text).slice(0, 240)}`);
    }
    try {
        return JSON.parse(raw.slice(start, end + 1));
    } catch (e) {
        throw new Error(`Invalid JSON from model: ${e.message}`);
    }
}

function validateQuestion(question, mode) {
    const q = String(question || '').trim();
    if (q.length < 40 || q.length > 420) throw new Error(`Question length out of range (${q.length})`);
    if (!q.endsWith('?')) throw new Error('Question must end with ?');
    if (/ignore (all|previous)|system prompt|jailbreak/i.test(q)) throw new Error('Question failed safety check');

    if (mode === 'breaking') {
        const stalePattern = /\b(in late|earlier this month|last month|last week|weeks ago|months ago|years ago|202[0-4]|january|february|march|april|may)\b/i;
        if (stalePattern.test(q) && !/\b(today|yesterday|this morning|tonight|just|hours ago|breaking|new filing|new ruling|new vote)\b/i.test(q)) {
            throw new Error('Breaking question sounds too dated; retry with today or yesterday framing');
        }
    }

    if (mode === 'ridiculous') {
        const plausibleGovPattern = /\b(did congress pass|did the supreme court rule|did the president sign|did the fed (raise|cut) rates)\b/i;
        if (plausibleGovPattern.test(q) && !/\b(chuck e\. cheese|moon|mars|dinosaur|unicorn|flat earth|lizard|simulation|minecraft|tiktok ban all)\b/i.test(q)) {
            throw new Error('Ridiculous question still sounds too believable');
        }
    }

    return q;
}

function buildBreakingPrompt(dateYmd, headlines) {
    const list = headlines.map((h, i) => formatHeadlineForPrompt(h, i)).join('\n');
    return [
        `You are drafting the click-2 "current events question" for Claim Clash (${dateYmd}).`,
        'This MUST feel like a push alert from the last 24 to 48 hours.',
        '',
        'Pick ONE story that is either:',
        '  (A) Breaking news from today or yesterday, OR',
        '  (B) A brand-new development in an ongoing case (new court filing, ruling, vote, arrest, ceasefire breach, jobs report, etc.) that happened in the last 48 hours.',
        '',
        'Hard recency rules:',
        '- Lead with "today", "yesterday", "this morning", or an explicit calendar date within the last 2 days.',
        '- Ongoing cases are fine ONLY if you name the new development, not the old headline everyone already heard.',
        '- Do NOT recycle stories that peaked days ago (e.g. "as the Court closed its term in late June" when players want what broke TODAY).',
        '- If headlines are stale, pick the freshest development you can verify from the list; never default to old Supreme Court roundups.',
        '',
        'Good (recent + fact-checkable):',
        '- Did the Senate confirm a new Fed chair nominee in a floor vote yesterday, and what was the final tally?',
        '- Did prosecutors file new charges today in the ongoing classified-documents case, and against whom?',
        '',
        'Bad (too old or homework-y):',
        '- Did the Supreme Court strike down a birthright citizenship order "today" when that story is days old.',
        '- Broad "what happened this term" questions without a fresh development.',
        '',
        'Style: one sentence, ends with ?, under 220 characters if possible. Neutral tone. No "who is right".',
        '',
        'Headlines (Google News US; bracketed age is approximate):',
        list,
        '',
        'Respond with ONLY JSON:',
        '{"headline_seed":"short topic label","daily":"the question ending with ?","recency_note":"why this is from the last 48 hours"}'
    ].join('\n');
}

function buildRidiculousPrompt(dateYmd) {
    return [
        `You are drafting the click-2 "current events question" for Claim Clash (${dateYmd}).`,
        'It is a slow news day: no dominant fresh headline worth a serious timely question.',
        '',
        'Write an OBVIOUSLY RIDICULOUS claim that no reasonable player would believe is real.',
        'It should still sound like viral misinformation someone might joke about, but fact-checking should instantly land on "no, that is fake."',
        '',
        'Rules:',
        '- One sentence, ends with ?, under 220 characters if possible.',
        '- Use absurd specifics (fake laws, silly units, cartoon logic, impossible timelines).',
        '- Do NOT use real breaking news. Do NOT sound like a plausible Reuters headline.',
        '- Still answerable: reputable sources would clearly debunk it.',
        '- Keep it playful, not cruel or bigoted.',
        '',
        'Good examples:',
        '- Did Congress pass a law requiring every U.S. highway mile marker to be replaced with bronze statues of eagles by Friday?',
        '- Did the White House confirm the Moon will switch to a permanent crescent shape visible from Earth after this weekend?',
        '',
        'Bad (too believable):',
        '- Did inflation rise 0.3% last month?',
        '- Did a senator introduce a bill about Social Security?',
        '',
        'Respond with ONLY JSON:',
        '{"headline_seed":"slow news day - ridiculous","daily":"the ridiculous question ending with ?","recency_note":"obvious satire fallback"}'
    ].join('\n');
}

function loadPreviousPool() {
    for (const filePath of [FEED_PATH, DRAFT_PATH]) {
        if (!fs.existsSync(filePath)) continue;
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (Array.isArray(data.pool) && data.pool.length) {
                return data.pool
                    .filter(entry => entry && typeof entry.text === 'string' && entry.text.trim())
                    .map(entry => ({
                        text: entry.text.trim(),
                        date: typeof entry.date === 'string' ? entry.date : ''
                    }));
            }
        } catch (e) {
            /* try next source */
        }
    }
    return [];
}

function buildAccumulatedPool(daily, dateYmd, previousPool) {
    const seen = new Set();
    const pool = [];
    const add = (text, date) => {
        const clean = String(text || '').trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        pool.push({ text: clean, date: date || dateYmd });
    };
    add(daily, dateYmd);
    previousPool.forEach(entry => add(entry.text, entry.date));
    return pool.slice(0, POOL_MAX);
}

async function craftQuestion(apiKey, dateYmd, mode, headlines) {
    const prompt = mode === 'ridiculous'
        ? buildRidiculousPrompt(dateYmd)
        : buildBreakingPrompt(dateYmd, headlines);
    let lastError = 'craft failed';
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const retrySuffix = attempt
                ? '\n\nYour previous reply was invalid. Return ONLY a single JSON object, no markdown, no commentary.'
                : '';
            const raw = await callGemini(apiKey, prompt + retrySuffix);
            const parsed = extractJsonBlock(raw);
            const daily = validateQuestion(parsed.daily, mode);
            return {
                daily,
                headlineSeed: String(parsed.headline_seed || (mode === 'ridiculous' ? 'slow news day' : headlines[0]?.title || '')).trim().slice(0, 200),
                recencyNote: String(parsed.recency_note || '').trim().slice(0, 300),
                mode
            };
        } catch (e) {
            lastError = e.message || String(e);
        }
    }
    throw new Error(lastError);
}

async function main() {
    const args = parseArgs(process.argv);
    const dateYmd = args.date || todayYmd();
    const apiKey = loadGeminiKey();
    if (!apiKey) {
        console.error('Set GEMINI_API_KEY or add geminiApiKey to scripts/alpha-keys.local.json');
        process.exit(1);
    }

    console.log('Fetching headlines...');
    const allHeadlines = await fetchHeadlines();
    const recentHeadlines = filterRecentHeadlines(allHeadlines);
    const slowNewsDay = args.mode === 'ridiculous' || (args.mode !== 'breaking' && detectSlowNewsDay(recentHeadlines));
    const mode = slowNewsDay ? 'ridiculous' : 'breaking';

    console.log(`Got ${allHeadlines.length} headlines (${recentHeadlines.length} within ${RECENT_HOURS}h).`);
    console.log(`Top recent: ${recentHeadlines[0]?.title || allHeadlines[0]?.title}`);
    console.log(`Feed mode: ${mode}${slowNewsDay ? ' (slow news day)' : ''}`);

    console.log(`Crafting ${mode} current events question via Gemini...`);
    let crafted;
    if (mode === 'breaking') {
        try {
            crafted = await craftQuestion(apiKey, dateYmd, 'breaking', recentHeadlines);
        } catch (e) {
            console.warn(`Breaking craft failed (${e.message}); falling back to ridiculous.`);
            crafted = await craftQuestion(apiKey, dateYmd, 'ridiculous', recentHeadlines);
        }
    } else {
        crafted = await craftQuestion(apiKey, dateYmd, 'ridiculous', recentHeadlines);
    }

    const previousPool = loadPreviousPool();
    const pool = buildAccumulatedPool(crafted.daily, dateYmd, previousPool);

    const draft = {
        v: 1,
        date: dateYmd,
        daily: crafted.daily,
        headline_seed: crafted.headlineSeed,
        feed_mode: crafted.mode,
        recency_note: crafted.recencyNote,
        pool,
        issued_at: midnightUtcUnix(dateYmd)
    };

    console.log('\n--- Draft ---');
    console.log('feed_mode:', crafted.mode);
    console.log('headline_seed:', crafted.headlineSeed);
    console.log('recency_note:', crafted.recencyNote);
    console.log('daily:', crafted.daily);

    if (args.dryRun) {
        console.log('\n(dry-run: draft.json not written)');
        return;
    }

    fs.writeFileSync(DRAFT_PATH, JSON.stringify(draft, null, 2) + '\n', 'utf8');
    console.log(`\nWrote ${DRAFT_PATH}`);
    console.log('Next: node scripts/sign-brain-feed.mjs');
}

main().catch(err => {
    console.error(err.message || err);
    process.exit(1);
});