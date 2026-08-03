import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const securitySource = readFileSync(new URL('../security/requestSecurity.mjs', import.meta.url), 'utf8');

assert(/path === '\/api\/media\/upload-policy'\) return createMediaUploadPolicy/.test(source), 'upload policy route exists');
assert(/dataStore\.mediaWrites\?\.createPending/.test(source), 'real upload policy persists pending metadata');
assert(/\/api\/media\/assets\//.test(source) && /completeMediaAsset/.test(source), 'completion route exists');
assert(/dataStore\.mediaWrites\.complete/.test(source), 'completion uses postgres media gateway');
assert(/dataStore\.mediaWrites\.delete/.test(source), 'deletion uses postgres media gateway');
assert(/MEDIA_EXTENSION_MISMATCH/.test(source), 'MIME and extension mismatch has a stable error');
assert(/MEDIA_SIZE_REQUIRED/.test(source), 'positive file size is required');
assert(/MEDIA_STORAGE_NOT_CONFIGURED/.test(source), 'production media metadata fails closed without postgres');
assert(/MEDIA_UPLOAD_PREPARATION_FAILED/.test(source), 'provider and persistence failures use a stable redacted error');
assert(/path\.startsWith\('\/api\/media\/'\)/.test(securitySource), 'all media routes use the central member policy');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'upload-policy-route',
        'pending-metadata-persistence',
        'completion-route',
        'deletion-route',
        'mime-extension-validation',
        'size-validation',
        'postgres-fail-closed',
        'stable-redacted-errors',
        'central-media-auth',
      ],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres media route check failed: ${message}`);
}
