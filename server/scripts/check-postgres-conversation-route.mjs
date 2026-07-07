import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/function getConversation/.test(source), 'conversation detail route exists');
assert(/if \(dataStore\.kind !== 'json'\) \{[\s\S]*CONVERSATION_NOT_FOUND[\s\S]*return json\(conversation\);[\s\S]*\}/.test(source), 'postgres conversation detail is read only');
assert(/dataStore\.kind === 'json' \|\| Boolean\(store\.conversations\[order\.id\]\)/.test(source), 'postgres conversation list only returns existing conversations');
assert(/if \(dataStore\.kind === 'json'\) store\.conversations\[order\.id\] \|\|= createConversation\(order\);/.test(source), 'json mode may still create demo conversations');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['conversation-detail-read-only', 'conversation-list-read-only', 'json-demo-conversation-create'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres conversation route check failed: ${message}`);
}
