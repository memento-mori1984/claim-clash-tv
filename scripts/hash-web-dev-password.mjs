#!/usr/bin/env node
/**
 * Generate Cloudflare Worker secrets for Claim-Clash.com developer password gate.
 *
 * Usage:
 *   node scripts/hash-web-dev-password.mjs "YourStrongPasswordHere"
 *
 * Outputs DEV_PASSWORD_CREDENTIAL (saltHex.hashHex) and a random SESSION_SECRET.
 * Store both with: wrangler secret put <NAME>
 */

import { webcrypto } from 'node:crypto';

const PBKDF2_ITERATIONS = 100_000; // Workers Web Crypto max

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
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Usage: node scripts/hash-web-dev-password.mjs "YourStrongPassword"');
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const salt = webcrypto.getRandomValues(new Uint8Array(16));
const hash = await pbkdf2(password, salt);
const sessionSecret = bytesToBase64Url(webcrypto.getRandomValues(new Uint8Array(32)));
const credential = `${bytesToHex(salt)}.${bytesToHex(hash)}`;

console.log('');
console.log('=== Claim Clash web developer secrets ===');
console.log('');
console.log('DEV_PASSWORD_CREDENTIAL=' + credential);
console.log('SESSION_SECRET=' + sessionSecret);
console.log('');
console.log('Set Cloudflare secrets (from claim-clash-tv/workers):');
console.log('  cd workers');
console.log('  npx wrangler secret put DEV_PASSWORD_CREDENTIAL');
console.log('  npx wrangler secret put SESSION_SECRET');
console.log('');
console.log('Paste the values above when prompted. Do not commit them.');
console.log('');