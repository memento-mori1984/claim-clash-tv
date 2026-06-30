#!/usr/bin/env node
/**
 * Generate an Ed25519 keypair for signing Claim Clash Brain feeds.
 * Keep the private key offline; commit only public.key.hex to the repo.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'brain-feed');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubDer = publicKey.export({ type: 'spki', format: 'der' });
const pubRaw = pubDer.subarray(pubDer.length - 32);
const pubHex = pubRaw.toString('hex');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'public.key.hex'), pubHex + '\n', 'utf8');
fs.writeFileSync(
    path.join(outDir, 'private.key.pem'),
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
    'utf8'
);

console.log('Wrote brain-feed/public.key.hex');
console.log('Wrote brain-feed/private.key.pem (keep secret; do not commit)');
console.log('Public key hex:', pubHex);