#!/usr/bin/env node
/**
 * Generate and upload Claim Clash web gate secrets reliably (no shell piping).
 *
 * Usage:
 *   node scripts/set-web-secrets.mjs "ClaimClash2026"
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { webcrypto } from 'node:crypto';

const PBKDF2_ITERATIONS = 100_000; // Workers Web Crypto max
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workersDir = join(root, 'workers');

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

function bytesToBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function pbkdf2(password, salt) {
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Usage: node scripts/set-web-secrets.mjs "YourPassword"');
  process.exit(1);
}

const salt = webcrypto.getRandomValues(new Uint8Array(16));
const hash = await pbkdf2(password, salt);
const sessionSecret = bytesToBase64Url(webcrypto.getRandomValues(new Uint8Array(32)));
const credential = `${bytesToHex(salt)}.${bytesToHex(hash)}`;

const devVars = [
  '# Claim Clash web dev secrets - DO NOT COMMIT',
  `# Developer login password: ${password}`,
  '',
  `DEV_PASSWORD_CREDENTIAL=${credential}`,
  `SESSION_SECRET=${sessionSecret}`,
  '',
].join('\n');

writeFileSync(join(workersDir, '.dev.vars'), devVars, 'utf8');

function wranglerConfigPath() {
  return join(homedir(), 'AppData', 'Roaming', 'xdg.config', '.wrangler', 'config', 'default.toml');
}

function readOAuthToken() {
  const text = readFileSync(wranglerConfigPath(), 'utf8');
  const match = text.match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!match) throw new Error('wrangler oauth token not found; run: npx wrangler login');
  return match[1];
}

async function putSecretApi(name, value) {
  const accountId = '5e072865f1a87aadec115dc0f7bfc7cd';
  const script = 'claim-clash-site';
  const token = readOAuthToken();
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${script}/secrets`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, text: value, type: 'secret_text' }),
    }
  );
  const payload = await response.json();
  if (!payload.success) {
    throw new Error(`secret ${name} failed: ${JSON.stringify(payload.errors || payload)}`);
  }
}

await putSecretApi('DEV_PASSWORD_CREDENTIAL', credential);
await putSecretApi('SESSION_SECRET', sessionSecret);

const deploy = spawnSync('npx', ['wrangler', 'deploy'], {
  cwd: workersDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (deploy.status !== 0) process.exit(deploy.status ?? 1);

console.log('');
console.log(`Password set: ${password}`);
console.log('Saved to workers/.dev.vars');