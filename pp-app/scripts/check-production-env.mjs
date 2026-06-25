import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.production');
const fileEnv = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
const apiBaseUrl = (process.env.VITE_API_BASE_URL || fileEnv.VITE_API_BASE_URL || '').trim();

if (!apiBaseUrl) {
  fail('VITE_API_BASE_URL is required for App Store/TestFlight builds. Copy .env.production.example to .env.production and set the real HTTPS API domain.');
}

if (!apiBaseUrl.startsWith('https://')) {
  fail('VITE_API_BASE_URL must use HTTPS for App Store/TestFlight builds.');
}

if (/^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(?::|\/|$)/i.test(apiBaseUrl)) {
  fail('VITE_API_BASE_URL must not point to a local development address for App Store/TestFlight builds.');
}

function parseEnv(source) {
  const next = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    next[key] = value;
  }
  return next;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
