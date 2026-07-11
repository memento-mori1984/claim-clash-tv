#!/usr/bin/env node
/**
 * Sign a Brain feed JSON payload for server-side creator control.
 * Canonical message must match src-tauri/src/lib.rs (fetch_brain_feed).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function usage() {
    console.error('Usage: node scripts/sign-brain-feed.mjs [--key brain-feed/private.key.pem] [--in brain-feed/draft.json] [--out brain-feed/feed.json]');
    process.exit(1);
}

function parseArgs(argv) {
    const args = { key: 'brain-feed/private.key.pem', inFile: 'brain-feed/draft.json', outFile: 'brain-feed/feed.json' };
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--key') args.key = argv[++i];
        else if (argv[i] === '--in') args.inFile = argv[++i];
        else if (argv[i] === '--out') args.outFile = argv[++i];
        else usage();
    }
    return args;
}

function canonicalMessage(payload) {
    const poolJson = JSON.stringify(payload.pool || []);
    return [
        'claim-clash-brain-v1',
        String(payload.v),
        String(payload.date),
        String(payload.daily),
        poolJson,
        String(payload.issued_at)
    ].join('\n');
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv);
const keyPath = path.isAbsolute(args.key) ? args.key : path.join(root, args.key);
const inPath = path.isAbsolute(args.inFile) ? args.inFile : path.join(root, args.inFile);
const outPath = path.isAbsolute(args.outFile) ? args.outFile : path.join(root, args.outFile);

if (!fs.existsSync(keyPath)) {
    console.error(`Missing private key: ${keyPath}`);
    console.error('Run: node scripts/generate-brain-keys.mjs');
    process.exit(1);
}
if (!fs.existsSync(inPath)) {
    console.error(`Missing input JSON: ${inPath}`);
    process.exit(1);
}

const draft = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const unsigned = {
    v: draft.v ?? 1,
    date: draft.date,
    daily: draft.daily,
    pool: draft.pool ?? [],
    issued_at: Math.floor(Date.now() / 1000)
};

const message = canonicalMessage(unsigned);
const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath, 'utf8'));
const sig = crypto.sign(null, Buffer.from(message, 'utf8'), privateKey);
const signed = { ...unsigned, sig: sig.toString('base64') };

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(signed, null, 2) + '\n', 'utf8');
console.log('Signed feed written to', outPath);