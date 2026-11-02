#!/usr/bin/env node
// Builds the "Secret Key (for OAuth)" that Supabase's Apple provider needs.
// Apple caps it at 6 months, so rerun this before it expires.
//
// Usage:
//   Node scripts/apple-client-secret.mjs <path/to/AuthKey_XXXX.p8> <servicesId> [keyId] [teamId]
//
// The secret is copied to the macOS clipboard and never printed.
import { execFileSync } from 'node:child_process';
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const [keyPath, servicesId, keyIdArg, teamIdArg] = process.argv.slice(2);

if (!keyPath || !servicesId) {
  console.error(
    'Usage: node scripts/apple-client-secret.mjs <AuthKey_XXXX.p8> <servicesId> [keyId] [teamId]',
  );
  process.exit(1);
}

const keyId = keyIdArg ?? /AuthKey_([A-Z0-9]{10})\.p8$/.exec(basename(keyPath))?.[1];
const teamId = teamIdArg ?? '3PK9E5YFY7';

if (!keyId) {
  console.error('Could not read the Key ID from the file name; pass it as the third argument.');
  process.exit(1);
}

const SIX_MONTHS_SECONDS = 15777000;
const now = Math.floor(Date.now() / 1000);
const exp = now + SIX_MONTHS_SECONDS;

const b64url = (value) => Buffer.from(value).toString('base64url');

const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
const payload = b64url(
  JSON.stringify({ iss: teamId, iat: now, exp, aud: 'https://appleid.apple.com', sub: servicesId }),
);
const signingInput = `${header}.${payload}`;

const key = createPrivateKey(readFileSync(keyPath));
const signature = sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
const secret = `${signingInput}.${signature.toString('base64url')}`;

execFileSync('pbcopy', { input: secret });

console.info(`Secret copied to clipboard (Key ID ${keyId}, Team ${teamId}, client ${servicesId}).`);
console.info(`It expires on ${new Date(exp * 1000).toISOString().slice(0, 10)}.`);
