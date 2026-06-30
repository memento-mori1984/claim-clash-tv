#!/usr/bin/env node
/**
 * Draft today's current-events question for the signed Brain feed.
 * Picks the dominant cross-platform news/social topic, then crafts an
 * evidence-based Claim Clash question (same style as example-flow-questions.js).
 *
 * Usage:
 *   $env:GEMINI_API_KEY = "AIza..."
 *   node scripts/craft-current-events-question.mjs
 *   node scripts/craft-current-events-question.mjs --date 2026-06-30 --dry-run
 *
 * Reads optional GEMINI_API_KEY from env or scripts/alpha-keys.local.json.
 * Writes brain-feed/draft.json (unsigned). Run sign-brain-feed.mjs next.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRAFT_PATH = path.join(root, 'brain-feed', 'draft.json');
const NEWS_RSS = 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

function usage() {
    console.error('Usage: node scripts/craft-current-events-question.mjs [--date YYYY-MM-DD] [--dry-run]');
    process.exit(1);
}

function parseArgs(argv) {
    const args = { date: null, dryRun: false };
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--date') args.date = argv[++i];
        else if (argv[i] === '--dry-run') args.dryRun = true;
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

function parseRssTitles(xml) {
    const titles = [];
    const re = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/item>/gi;
    let match;
    while ((match = re.exec(xml)) && titles.length < 40) {
        const title = decodeXml(match[1]);
        if (title) titles.push(title);
    }
    return titles;
}

async function fetchHeadlines() {
    const res = await fetch(NEWS_RSS, {
        headers: { 'User-Agent': 'ClaimClash-BrainFeed/1.0' }
    });
    if (!res.ok) throw new Error(`News RSS failed: ${res.status}`);
    const xml = await res.text();
    const titles = parseRssTitles(xml);
    if (!titles.length) throw new Error('No headlines parsed from RSS');
    return titles;
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
                generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
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
    if (start === -1 || end === -1) throw new Error('Model did not return JSON');
    return JSON.parse(raw.slice(start, end + 1));
}

function validateQuestion(question) {
    const q = String(question || '').trim();
    if (q.length < 40 || q.length > 420) throw new Error(`Question length out of range (${q.length})`);
    if (!q.endsWith('?')) throw new Error('Question must end with ?');
    if (/ignore (all|previous)|system prompt|jailbreak/i.test(q)) throw new Error('Question failed safety check');
    return q;
}

function buildPrompt(dateYmd, headlines) {
    const list = headlines.map((h, i) => `${i + 1}. ${h}`).join('\n');
    return [
        `You are drafting the daily "current events question" for Claim Clash (${dateYmd}).`,
        'Pick the SINGLE largest story dominating both news and social media today — the one most people are arguing about.',
        'Write ONE evidence-based question in the style of these examples:',
        '- Did U.S. inflation peak above 9% year-over-year in 2022, and what did the CPI show when it began falling?',
        '- Did the Supreme Court\'s Dobbs decision overturn Roe v. Wade nationwide, or only remove federal constitutional protection?',
        '',
        'Rules:',
        '- Must be answerable with verifiable facts from reputable reporting (vote counts, dates, agency names, dollar amounts, etc.).',
        '- No opinion prompts, no "who is right", no vague "what do you think".',
        '- One sentence, ends with ?',
        '- Neutral tone; suitable for two players fact-checking together.',
        '',
        'Headlines (Google News US, most recent first):',
        list,
        '',
        'Respond with ONLY JSON:',
        '{"headline_seed":"short topic label","daily":"the question ending with ?"}'
    ].join('\n');
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
    const headlines = await fetchHeadlines();
    console.log(`Got ${headlines.length} headlines. Top: ${headlines[0]}`);

    console.log('Crafting current events question via Gemini...');
    const raw = await callGemini(apiKey, buildPrompt(dateYmd, headlines));
    const parsed = extractJsonBlock(raw);
    const daily = validateQuestion(parsed.daily);
    const headlineSeed = String(parsed.headline_seed || headlines[0] || '').trim().slice(0, 200);

    const draft = {
        v: 1,
        date: dateYmd,
        daily,
        headline_seed: headlineSeed,
        pool: [{ text: daily, date: dateYmd }],
        issued_at: midnightUtcUnix(dateYmd)
    };

    console.log('\n--- Draft ---');
    console.log('headline_seed:', headlineSeed);
    console.log('daily:', daily);

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