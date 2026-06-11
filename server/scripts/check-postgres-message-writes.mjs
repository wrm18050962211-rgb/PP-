import { sendMessageTransaction } from '../store/postgresMessageWrites.mjs';

const baseDraft = {
  conversationId: '00000000-0000-4000-8000-000000000101',
  messageId: '00000000-0000-4000-8000-000000000102',
  senderId: '00000000-0000-4000-8000-000000000103',
  senderRole: 'user',
  content: 'See you at the cafe entrance.',
  sentAt: '2026-06-12T06:30:00.000Z',
};

const cleanClient = createMockClient({ conversationStatus: 'active' });
const clean = await sendMessageTransaction(cleanClient, baseDraft);
const cleanSql = cleanClient.calls.map((call) => call.sql);
assert(clean.riskStatus === 'clean' && clean.blocked === false, 'clean message is accepted');
assert(cleanSql[0] === 'begin', 'clean transaction begins');
assert(cleanSql.some((sql) => /from conversations c/i.test(sql) && /for update of c/i.test(sql)), 'locks conversation for update');
assert(cleanSql.some((sql) => /insert into messages/i.test(sql) && /risk_status/i.test(sql)), 'inserts clean message');
assert(!cleanSql.some((sql) => /insert into message_risk_events/i.test(sql)), 'clean message does not create risk event');
assert(cleanSql.some((sql) => /update conversations/i.test(sql) && /last_message_at/i.test(sql)), 'updates last message time');
assert(cleanSql.at(-1) === 'commit', 'clean transaction commits');

const flaggedClient = createMockClient({ conversationStatus: 'active' });
const flagged = await sendMessageTransaction(flaggedClient, {
  ...baseDraft,
  messageId: '00000000-0000-4000-8000-000000000104',
  riskEventId: '00000000-0000-4000-8000-000000000105',
  risk: { hits: [{ keyword: 'wechat', label: 'Contact exchange', level: 'high' }], shouldBlock: false },
});
const flaggedSql = flaggedClient.calls.map((call) => call.sql);
assert(flagged.riskStatus === 'flagged' && flagged.blocked === false, 'flagged message is accepted but flagged');
assert(flagged.riskEvent?.id, 'flagged message returns risk event');
assert(flaggedSql.some((sql) => /insert into message_risk_events/i.test(sql) && /action_taken/i.test(sql)), 'flagged message creates risk event');
assert(flaggedSql.at(-1) === 'commit', 'flagged transaction commits');

const blockedClient = createMockClient({ conversationStatus: 'active' });
const blocked = await sendMessageTransaction(blockedClient, {
  ...baseDraft,
  messageId: '00000000-0000-4000-8000-000000000106',
  riskEventId: '00000000-0000-4000-8000-000000000107',
  content: 'Add my wechat and pay offline.',
  risk: { hits: [{ keyword: 'wechat', label: 'Contact exchange', level: 'high' }], shouldBlock: true },
});
const blockedSql = blockedClient.calls.map((call) => call.sql);
assert(blocked.riskStatus === 'blocked' && blocked.blocked === true, 'blocked message is stored as blocked');
assert(blockedSql.some((sql) => /insert into messages/i.test(sql)), 'blocked message still writes audit message');
assert(blockedSql.some((sql) => /insert into message_risk_events/i.test(sql)), 'blocked message writes risk event');
assert(blockedSql.at(-1) === 'commit', 'blocked transaction commits');

const restrictedClient = createMockClient({ conversationStatus: 'restricted' });
await assertRejects(() => sendMessageTransaction(restrictedClient, baseDraft), 'Conversation is restricted', 'restricted conversation rejects');
assert(restrictedClient.calls.at(-1).sql === 'rollback', 'restricted conversation rolls back');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['clean-message', 'flagged-message', 'blocked-message', 'risk-event', 'restricted-rollback'],
      cleanQueryCount: cleanClient.calls.length,
      flaggedQueryCount: flaggedClient.calls.length,
      blockedQueryCount: blockedClient.calls.length,
    },
    null,
    2,
  ),
);

function createMockClient({ conversationStatus }) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      calls.push({ sql: normalized, params });
      if (/from conversations c/i.test(normalized)) {
        return {
          rows: [
            {
              id: baseDraft.conversationId,
              order_id: '00000000-0000-4000-8000-000000000108',
              user_id: baseDraft.senderId,
              companion_id: '00000000-0000-4000-8000-000000000109',
              status: conversationStatus,
              order_status: 'confirmed',
            },
          ],
        };
      }
      if (/insert into messages/i.test(normalized)) return { rows: [{ id: params[0], conversation_id: params[1], risk_status: params[7] }] };
      if (/insert into message_risk_events/i.test(normalized)) return { rows: [{ id: params[0], action_taken: params[8] }] };
      return { rows: [] };
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres message write check failed: ${message}`);
}

async function assertRejects(fn, messagePart, label) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(messagePart), label);
    return;
  }
  throw new Error(`Postgres message write check failed: ${label}`);
}
