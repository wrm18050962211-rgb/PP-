import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

const forbiddenPatterns = [
  [/idempotencyId:\s*id\(/, 'idempotency drafts must use postgresId()'],
  [/conversationId:\s*id\(/, 'conversation drafts must use postgresId()'],
  [/statusLogId:\s*id\(/, 'status log drafts must use postgresId()'],
  [/draft\.settlementId\s*=\s*id\(/, 'settlement drafts must use postgresId()'],
  [/draft\.ledgerEntryId\s*=\s*id\(/, 'ledger drafts must use postgresId()'],
  [/draft\.refundId\s*=\s*id\(/, 'refund drafts must use postgresId()'],
  [/const messageId\s*=\s*id\(/, 'message drafts must use postgresId()'],
  [/riskEventId:\s*risk\.hits\.length\s*\?\s*id\(/, 'risk event drafts must use postgresId()'],
  [/auditCaseId:\s*id\(/, 'audit case drafts must use postgresId()'],
  [/auditLogId:\s*id\(/, 'audit log drafts must use postgresId()'],
  [/adminActionLogId:\s*id\(/, 'admin action drafts must use postgresId()'],
  [/callbackEventId:\s*id\(/, 'provider callback drafts must use postgresId()'],
];

for (const [pattern, message] of forbiddenPatterns) {
  assert(!pattern.test(source), message);
}

assert(/function postgresId\(\)[\s\S]*randomUUID\(\)/.test(source), 'postgresId helper uses randomUUID');
assert(/const orderId = dataStore\.kind !== 'json' \? postgresId\(\) : id\('order'\)/.test(source), 'postgres order ids use postgresId');
assert(/id: dataStore\.kind !== 'json' \? postgresId\(\) : id\('report'\)/.test(source), 'postgres report ids use postgresId');
assert(/id: dataStore\.kind !== 'json' \? postgresId\(\) : id\('security-event'\)/.test(source), 'postgres security event ids use postgresId');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['no-postgres-draft-prefix-ids', 'postgres-id-helper', 'order-id', 'report-id', 'security-event-id'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres id hygiene check failed: ${message}`);
}
