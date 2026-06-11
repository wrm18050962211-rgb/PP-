import { spawn } from 'node:child_process';

const checks = [
  ['store-driver', ['scripts/check-store-driver.mjs']],
  ['postgres-mappers', ['scripts/check-postgres-mappers.mjs']],
  ['postgres-write-plan', ['scripts/check-postgres-write-plan.mjs']],
  ['postgres-order-writes', ['scripts/check-postgres-order-writes.mjs']],
  ['postgres-message-writes', ['scripts/check-postgres-message-writes.mjs']],
  ['postgres-moderation-writes', ['scripts/check-postgres-moderation-writes.mjs']],
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
