import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReleaseManifest } from '../../deploy/create-release-manifest.mjs';

const serverRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(serverRoot, '..');
const readRepoFile = (path) => readFile(resolve(repoRoot, path), 'utf8');

const [payment, adminNginx, apexNginx, switchScript, runbook, workflow, launchGuide] = await Promise.all([
  readRepoFile('website/payment.html'),
  readRepoFile('deploy/nginx-still-admin.conf'),
  readRepoFile('deploy/nginx-still-root-redirect.conf'),
  readRepoFile('deploy/switch-static-release.sh'),
  readRepoFile('deploy/STATIC_DELIVERY_RUNBOOK.md'),
  readRepoFile('.github/workflows/ci.yml'),
  readRepoFile('docs/APP_STORE_LAUNCH.md'),
]);

assert(/<meta name="robots" content="noindex,nofollow"/.test(payment), 'payment draft is excluded from search indexing');
assert(payment.includes('上线前草案'), 'payment page identifies itself as a draft');
assert(payment.includes('当前页面不得作为真实收款已开通的证明'), 'payment page does not claim live payments');
assert(payment.includes('https://www.weareinframe.com/payment.html'), 'payment page records the intended stable URL');
assert(/href="refund\.html"/.test(payment), 'payment page links to the refund policy');

const websiteFiles = (await readdir(resolve(repoRoot, 'website'))).filter((name) => name.endsWith('.html'));
for (const file of websiteFiles) {
  const html = await readRepoFile(`website/${file}`);
  assert(/href="payment\.html"/.test(html), `${file} links to the payment draft`);
}

assert(/server_name admin\.weareinframe\.com;/.test(adminNginx), 'Admin has an independent hostname');
assert(/root \/opt\/still-admin\/current;/.test(adminNginx), 'Admin serves the current immutable release');
assert(/try_files \$uri \$uri\/ \/index\.html;/.test(adminNginx), 'Admin supports SPA routing');
assert(adminNginx.includes('Content-Security-Policy'), 'Admin bootstrap includes a content security policy');
assert(/return 301 https:\/\/www\.weareinframe\.com\$request_uri;/.test(apexNginx), 'apex redirect preserves path and query');

assert(/release_root="\/opt\/still-(admin|website)"/.test(switchScript), 'release switch uses immutable component roots');
assert(/mv -Tf "\$next_link" "\$current_link"/.test(switchScript), 'release switch updates the current symlink atomically');
assert(switchScript.includes('previous static release restored'), 'release switch documents rollback after a failed probe');

for (const phrase of ['EXT-DOMAIN-1', 'ICP filing is still a draft', 'certbot renew --dry-run', '30/14/7-day', 'Option A: Cloudflare Pages', 'Option B: server-side apex redirect']) {
  assert(runbook.includes(phrase), `runbook includes ${phrase}`);
}
assert(runbook.includes('does not complete `WIN-ADMIN-1`'), 'runbook does not claim Admin acceptance');

assert(workflow.includes('still-admin-${{ github.sha }}'), 'CI names the Admin artifact with the full commit SHA');
assert(workflow.includes('still-website-${{ github.sha }}'), 'CI names the website artifact with the full commit SHA');
assert(workflow.includes('create-release-manifest.mjs'), 'CI writes release manifests');

const manifest = buildReleaseManifest({
  component: 'admin',
  commitSha: 'a'.repeat(40),
  buildTime: '2026-08-03T00:00:00.000Z',
  migrationVersion: '20260803_add_media_assets.sql',
});
assert(manifest.commitSha === 'a'.repeat(40), 'release manifest keeps the full commit SHA');
assert(manifest.migrationVersion === '20260803_add_media_assets.sql', 'release manifest records the migration version');

assert(launchGuide.includes('https://www.weareinframe.com/payment.html'), 'launch guide records the intended payment URL');
assert(launchGuide.includes('EXT-DOMAIN-1'), 'launch guide records the external domain blocker');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'payment-draft-guard',
        'website-policy-links',
        'admin-host-bootstrap',
        'apex-redirect-plan',
        'immutable-release-switch',
        'static-ci-artifacts',
        'domain-blocker-runbook',
      ],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Domain delivery preparation check failed: ${message}`);
}
