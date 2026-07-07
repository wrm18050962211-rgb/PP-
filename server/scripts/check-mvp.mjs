import { spawn } from 'node:child_process';

const checks = [
  ['auth-schema', ['../database/scripts/check-auth-schema.mjs']],
  ['idempotency-schema', ['../database/scripts/check-idempotency-schema.mjs']],
  ['schema-parity', ['../database/scripts/check-schema-parity.mjs']],
  ['ci-workflow', ['scripts/check-ci-workflow.mjs']],
  ['store-driver', ['scripts/check-store-driver.mjs']],
  ['admin-route-boundary', ['scripts/check-admin-route-boundary.mjs']],
  ['payment-expiry-job', ['scripts/check-payment-expiry-job.mjs']],
  ['provider-callback-retry-job', ['scripts/check-provider-callback-retry-job.mjs']],
  ['wechat-callback-processors', ['scripts/check-wechat-callback-processors.mjs']],
  ['session-boundary', ['scripts/check-session-boundary.mjs']],
  ['postgres-store-auth-gateway', ['scripts/check-postgres-store-auth-gateway.mjs']],
  ['postgres-store-audit-security-gateway', ['scripts/check-postgres-store-audit-security-gateway.mjs']],
  ['postgres-store-session-gateway', ['scripts/check-postgres-store-session-gateway.mjs']],
  ['postgres-store-idempotency-gateway', ['scripts/check-postgres-store-idempotency-gateway.mjs']],
  ['postgres-store-read-model', ['scripts/check-postgres-store-read-model.mjs']],
  ['postgres-id-hygiene', ['scripts/check-postgres-id-hygiene.mjs']],
  ['postgres-write-route-guard', ['scripts/check-postgres-write-route-guard.mjs']],
  ['postgres-security-boundary-route', ['scripts/check-postgres-security-boundary-route.mjs']],
  ['postgres-message-route', ['scripts/check-postgres-message-route.mjs']],
  ['postgres-report-route', ['scripts/check-postgres-report-route.mjs']],
  ['postgres-moderation-route', ['scripts/check-postgres-moderation-route.mjs']],
  ['postgres-order-route', ['scripts/check-postgres-order-route.mjs']],
  ['postgres-payment-route', ['scripts/check-postgres-payment-route.mjs']],
  ['postgres-payment-status-route', ['scripts/check-postgres-payment-status-route.mjs']],
  ['postgres-wechat-notify-route', ['scripts/check-postgres-wechat-notify-route.mjs']],
  ['postgres-conversation-route', ['scripts/check-postgres-conversation-route.mjs']],
  ['postgres-transition-route', ['scripts/check-postgres-transition-route.mjs']],
  ['postgres-admin-order-route', ['scripts/check-postgres-admin-order-route.mjs']],
  ['postgres-audit-review-route', ['scripts/check-postgres-audit-review-route.mjs']],
  ['postgres-companion-application-route', ['scripts/check-postgres-companion-application-route.mjs']],
  ['postgres-store-order-gateway', ['scripts/check-postgres-store-order-gateway.mjs']],
  ['postgres-store-message-gateway', ['scripts/check-postgres-store-message-gateway.mjs']],
  ['postgres-store-moderation-gateway', ['scripts/check-postgres-store-moderation-gateway.mjs']],
  ['postgres-mappers', ['scripts/check-postgres-mappers.mjs']],
  ['postgres-write-plan', ['scripts/check-postgres-write-plan.mjs']],
  ['postgres-auth-writes', ['scripts/check-postgres-auth-writes.mjs']],
  ['postgres-order-writes', ['scripts/check-postgres-order-writes.mjs']],
  ['postgres-provider-callback-writes', ['scripts/check-postgres-provider-callback-writes.mjs']],
  ['postgres-message-writes', ['scripts/check-postgres-message-writes.mjs']],
  ['postgres-moderation-writes', ['scripts/check-postgres-moderation-writes.mjs']],
  ['postgres-audit-writes', ['scripts/check-postgres-audit-writes.mjs']],
  ['postgres-security-writes', ['scripts/check-postgres-security-writes.mjs']],
  ['postgres-session-writes', ['scripts/check-postgres-session-writes.mjs']],
  ['postgres-idempotency-writes', ['scripts/check-postgres-idempotency-writes.mjs']],
  ['runtime-audit-gateway', ['scripts/check-runtime-audit-gateway.mjs']],
  ['production-media-guard', ['scripts/check-production-media-guard.mjs']],
  ['smoke', ['scripts/smoke.mjs']],
];

const startedAt = Date.now();
const results = [];

for (const [name, args] of checks) {
  const checkStartedAt = Date.now();
  await runNodeCheck(name, args);
  results.push({ name, durationMs: Date.now() - checkStartedAt });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: results,
      totalDurationMs: Date.now() - startedAt,
    },
    null,
    2,
  ),
);

function runNodeCheck(name, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n[check:mvp] ${name}`);
    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      env: { ...process.env },
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${name} failed with exit code ${code}`));
    });
  });
}
