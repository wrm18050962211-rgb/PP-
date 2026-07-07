import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/async function sendMessage/.test(source), 'sendMessage can await store gateway writes');
assert(/dataStore\.kind !== 'json' && dataStore\.messageWrites\?\.sendMessage/.test(source), 'postgres message route uses message write gateway');
assert(/async function sendPostgresMessage/.test(source), 'postgres message route has isolated helper');
assert(/dataStore\.messageWrites\.sendMessage/.test(source), 'postgres helper calls message write transaction');
assert(/const messageId = postgresId\(\)/.test(source), 'postgres message route uses uuid message id');
assert(/riskEventId: risk\.hits\.length \? postgresId\(\) : undefined/.test(source), 'risk messages carry a uuid risk event id');
assert(/changed: false[\s\S]*MESSAGE_BLOCKED/.test(source), 'blocked postgres messages do not trigger json save');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['message-route-gateway', 'uuid-message-id', 'risk-event-id', 'blocked-no-json-save'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres message route check failed: ${message}`);
}
