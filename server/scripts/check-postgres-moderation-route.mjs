import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/async function applyModerationAction/.test(source), 'applyModerationAction can await moderation gateway writes');
assert(/dataStore\.kind !== 'json' && dataStore\.moderationWrites\?\.applyAction/.test(source), 'postgres moderation route uses applyAction gateway');
assert(/async function applyPostgresModerationAction/.test(source), 'postgres moderation route has isolated helper');
assert(/dataStore\.moderationWrites\.applyAction/.test(source), 'postgres helper calls moderation transaction');
assert(/adminActionLogId: id\('admin-action'\)/.test(source), 'postgres moderation route creates admin action log id');
assert(/return json\([\s\S]*200,\s*false[\s\S]*\)/.test(source), 'postgres moderation route avoids json save');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['moderation-route-gateway', 'admin-action-log-id', 'no-json-save'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres moderation route check failed: ${message}`);
}
