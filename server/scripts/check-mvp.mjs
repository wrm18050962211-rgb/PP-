import { spawn } from 'node:child_process';

const checks = [
  ['auth-schema', ['../database/scripts/check-auth-schema.mjs']],
  ['store-driver', ['scripts/check-store-driver.mjs']],
  ['session-boundary', ['scripts/check-session-boundary.mjs']],
  ['postgres-store-auth-gateway', ['scripts/check-postgres-store-auth-gateway.mjs']],
  ['postgres-store-audit-security-gateway', ['scripts/check-postgres-store-audit-security-gateway.mjs']],
  ['postgres-store-session-gateway', ['scripts/check-postgres-store-session-gateway.mjs']],
  ['postgres-store-message-gateway', ['scripts/check-postgres-store-message-gateway.mjs']],
  ['postgres-store-moderation-gateway', ['scripts/check-postgres-store-moderation-gateway.mjs']],
  ['postgres-mappers', ['scripts/check-postgres-mappers.mjs']],
  ['postgres-write-plan', ['scripts/check-postgres-write-plan.mjs']],
  ['postgres-auth-writes', ['scripts/check-postgres-auth-writes.mjs']],
  ['postgres-order-writes', ['scripts/check-postgres-order-writes.mjs']],
  ['postgres-message-writes', ['scripts/check-postgres-message-writes.mjs']],
  ['postgres-moderation-writes', ['scripts/check-postgres-moderation-writes.mjs']],
  ['postgres-audit-writes', ['scripts/check-postgres-audit-writes.mjs']],
  ['postgres-security-writes', ['scripts/check-postgres-security-writes.mjs']],
  ['postgres-session-writes', ['scripts/check-postgres-session-writes.mjs']],
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
