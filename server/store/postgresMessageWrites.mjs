export async function sendMessageTransaction(client, draft) {
  assertClient(client);
  assertMessageDraft(draft);

  await client.query('begin');
  try {
    const conversationResult = await client.query(
      `select c.id,
              c.order_id,
              c.user_id,
              c.companion_id,
              c.status,
              o.status as order_status
       from conversations c
       join orders o on o.id = c.order_id
       where c.id = $1
       for update of c`,
      [draft.conversationId],
    );
    const conversation = conversationResult.rows?.[0];
    if (!conversation) throw conflict('CONVERSATION_NOT_FOUND', 'Conversation not found');
    if (conversation.status === 'restricted') throw conflict('CONVERSATION_RESTRICTED', 'Conversation is restricted');

    const risk = normalizeRisk(draft.risk);
    const messageResult = await client.query(
      `insert into messages (
        id, conversation_id, sender_id, sender_role, message_type, content,
        original_content, risk_status, blocked_reason, sent_at
      ) values ($1, $2, $3, $4, 'text', $5, $6, $7, $8, $9)
      returning *`,
      [
        draft.messageId,
        draft.conversationId,
        draft.senderId || null,
        draft.senderRole,
        risk.shouldBlock ? null : draft.content,
        draft.content,
        risk.status,
        risk.shouldBlock ? risk.blockedReason : null,
        draft.sentAt || new Date().toISOString(),
      ],
    );

    let riskEvent = null;
    if (risk.hits.length) {
      const eventResult = await client.query(
        `insert into message_risk_events (
          id, message_id, conversation_id, order_id, user_id, matched_keywords,
          risk_type, risk_level, action_taken, raw_payload
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        returning *`,
        [
          draft.riskEventId,
          draft.messageId,
          draft.conversationId,
          conversation.order_id,
          draft.senderId || null,
          risk.hits.map((hit) => hit.keyword),
          risk.type,
          risk.level,
          risk.shouldBlock ? 'block' : 'flag',
          { hits: risk.hits, content: draft.content },
        ],
      );
      riskEvent = eventResult.rows?.[0] || null;
    }

    await client.query(
      `update conversations
       set last_message_at = $1,
           updated_at = now()
       where id = $2`,
      [draft.sentAt || new Date().toISOString(), draft.conversationId],
    );

    await client.query('commit');
    return {
      message: messageResult.rows?.[0] || null,
      riskEvent,
      riskStatus: risk.status,
      blocked: risk.shouldBlock,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

function normalizeRisk(risk = {}) {
  const hits = Array.isArray(risk.hits) ? risk.hits : [];
  const shouldBlock = Boolean(risk.shouldBlock);
  return {
    hits,
    shouldBlock,
    status: shouldBlock ? 'blocked' : hits.length ? 'flagged' : 'clean',
    type: risk.type || hits[0]?.label || 'message_risk',
    level: risk.level || hits[0]?.level || (shouldBlock ? 'high' : 'medium'),
    blockedReason: risk.blockedReason || 'Message contains contact or off-platform payment content',
  };
}

function assertClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('PostgreSQL client with query(sql, params) is required');
  }
}

function assertMessageDraft(draft) {
  const required = ['conversationId', 'messageId', 'senderRole', 'content'];
  const risk = normalizeRisk(draft?.risk);
  if (risk.hits.length) required.push('riskEventId');
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (missing.length) throw new Error(`Missing sendMessage draft fields: ${missing.join(', ')}`);
}

function conflict(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  return error;
}
