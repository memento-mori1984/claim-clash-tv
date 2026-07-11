#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const devVars = readFileSync(join(root, 'workers', '.dev.vars'), 'utf8');
const cred = devVars.match(/DEV_PASSWORD_CREDENTIAL=(.+)/)?.[1]?.trim();
const sess = devVars.match(/SESSION_SECRET=(.+)/)?.[1]?.trim();
if (!cred || !sess) throw new Error('Missing secrets in workers/.dev.vars');

const cfg = readFileSync(
  join(homedir(), 'AppData', 'Roaming', 'xdg.config', '.wrangler', 'config', 'default.toml'),
  'utf8'
);
const token = cfg.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
if (!token) throw new Error('wrangler not logged in');

const accountId = '5e072865f1a87aadec115dc0f7bfc7cd';
const script = 'claim-clash-site';

async function put(name, value) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${script}/secrets`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, text: value, type: 'secret_text' }),
    }
  );
  const payload = await response.json();
  if (!payload.success) throw new Error(`${name}: ${JSON.stringify(payload.errors)}`);
  console.log(`Uploaded ${name} (${value.length} chars)`);
}

await put('DEV_PASSWORD_CREDENTIAL', cred);
await put('SESSION_SECRET', sess);
console.log('Done. No redeploy needed; retry login in a few seconds.');