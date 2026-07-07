import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/async function mockPaymentSuccess/.test(source), 'mockPaymentSuccess can await order gateway writes');
assert(/dataStore\.kind !== 'json' && dataStore\.orderWrites\?\.markPaymentPaid/.test(source), 'postgres payment route uses markPaymentPaid gateway');
assert(/async function markPostgresPaymentPaid/.test(source), 'postgres payment route has isolated helper');
assert(/dataStore\.orderWrites\.markPaymentPaid/.test(source), 'postgres helper calls payment transaction');
assert(/conversationId: postgresId\(\)/.test(source), 'postgres payment route creates uuid conversation id');
assert(/statusLogId: postgresId\(\)/.test(source), 'postgres payment route creates uuid status log id');
assert(/const result = await dataStore\.orderWrites\.markPaymentPaid/.test(source), 'postgres payment route keeps transaction result');
assert(/id: String\(result\.conversation\?\.id \|\| `conversation-\$\{paidOrder\.id\}`\)/.test(source), 'postgres payment route returns persisted conversation id');
assert(/conversation: paidConversation/.test(source), 'postgres payment route returns normalized persisted conversation');
assert(/return json\([\s\S]*conversation: paidConversation[\s\S]*200,\s*false/.test(source), 'postgres payment route avoids json save');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['payment-route-gateway', 'uuid-side-effect-ids', 'persisted-conversation-id', 'no-json-save'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres payment route check failed: ${message}`);
}
