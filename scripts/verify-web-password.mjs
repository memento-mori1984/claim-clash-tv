#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const PBKDF2_ITERATIONS = 100_000;

function hexToBytes(hex) {
  const text = String(hex || '').trim();
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
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

function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const password = process.argv[2] || 'ClaimClash2026';
const devVars = readFileSync(new URL('../workers/.dev.vars', import.meta.url), 'utf8');
const credLine = devVars.split('\n').find((l) => l.startsWith('DEV_PASSWORD_CREDENTIAL='));
const raw = credLine?.split('=').slice(1).join('=').trim();
const dot = raw.indexOf('.');
const salt = hexToBytes(raw.slice(0, dot));
const expected = hexToBytes(raw.slice(dot + 1));
const derived = await pbkdf2(password, salt);
console.log(timingSafeEqual(derived, expected) ? 'LOCAL_VERIFY_OK' : 'LOCAL_VERIFY_FAIL');