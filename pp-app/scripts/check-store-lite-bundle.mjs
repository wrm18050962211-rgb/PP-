import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORE_LITE_ENTRY, verifyStoreLiteRelease } from './store-lite-release-integrity.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requestedTarget = String(process.argv[2] || 'dist-store-lite').trim();
const dist = resolve(projectRoot, requestedTarget);
const failures = [];
const appSource = readFileSync(resolve(projectRoot, 'src', 'store-lite', 'StoreLiteApp.tsx'), 'utf8');
const expectedRoutePaths = [
  'photographers',
  'works/:postId',
  'photographers/:photographerId',
  'photographers/:photographerId/request',
  'bookings',
  'bookings/:bookingRequestId',
  'compliance',
  'compliance/requests',
  'compliance/requests/:userRequestId',
  'compliance/reports',
  'compliance/reports/:contentReportId',
  'compliance/blocked',
  'safety/report/:targetType/:targetId',
  'me',
  'login',
  '*',
];

const declaredRoutePaths = [...appSource.matchAll(/<Route\b[^>]*\bpath="([^"]+)"/g)].map((match) => match[1]);
const routeElementCount = [...appSource.matchAll(/<Route\b/g)].length;
const indexRouteCount = [...appSource.matchAll(/<Route\s+index\b/g)].length;
if (
  routeElementCount !== expectedRoutePaths.length + 2
  || indexRouteCount !== 1
  || JSON.stringify(declaredRoutePaths) !== JSON.stringify(expectedRoutePaths)
) {
  failures.push('Store Lite UI route manifest differs from the approved guest/consumer route allowlist.');
}

let release;
try {
  release = verifyStoreLiteRelease(dist);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

if (release) {
  const entries = Object.entries(release.viteManifest).filter(([, entry]) => entry?.isEntry === true);
  if (entries.length !== 1 || entries[0][0] !== STORE_LITE_ENTRY || entries[0][1]?.src !== STORE_LITE_ENTRY) {
    failures.push('Store Lite Vite manifest must have index.html as its sole entry facade.');
  }
  const sources = Object.values(release.viteManifest).map((entry) => String(entry?.src || '')).filter(Boolean);
  if (sources.some((source) => /(?:^|\/)src\/main\.tsx$/.test(source))) {
    failures.push('Store Lite manifest unexpectedly includes src/main.tsx.');
  }

  const textFiles = release.reachableFiles.filter((file) => /\.(?:html|js|json)$/i.test(file));
  const combined = textFiles.map((file) => readFileSync(resolve(dist, ...file.split('/')), 'utf8')).join('\n');

  for (const value of [
    '/api/feed/posts',
    '/api/posts/',
    '/api/companions/',
    '/api/auth/phone/request-code',
    '/api/auth/phone/verify',
    '/api/auth/session',
    '/api/auth/logout',
    '/api/booking-requests',
    '/api/user-requests',
    '/api/content-reports',
    '/api/me/content-reports',
    '/api/me/blocked-companions',
    'Store Lite API request is not allowed.',
  ]) {
    if (!combined.includes(value)) failures.push(`Store Lite bundle is missing required capability: ${value}.`);
  }
  for (const value of expectedRoutePaths.filter((path) => path !== '*')) {
    if (!combined.includes(value)) failures.push(`Store Lite bundle is missing approved UI route: ${value}.`);
  }
  for (const value of [
    '/api/admin/',
    'pp-admin-auth-token-v1',
    '/api/orders',
    '/api/payments',
    '/api/conversations',
    '/api/media/',
    '/api/companion/',
    '/mock-success',
    'AppDataProvider',
    'requestPayment',
    'uploadFile',
    '开发验证码',
    'testCode',
  ]) {
    if (combined.includes(value)) failures.push(`Store Lite bundle contains forbidden capability: ${value}.`);
  }
}

if (failures.length) {
  console.error('Store Lite bundle guard failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Store Lite bundle guard passed for ${requestedTarget} (${release.reachableFiles.length} verified runtime files).`);
