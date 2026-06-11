export async function createReportTransaction(client, draft) {
  assertClient(client);
  assertReportDraft(draft);

  await client.query('begin');
  try {
    const orderResult = await client.query(
      `select id, user_id, companion_id
       from orders
       where id = $1`,
      [draft.orderId],
    );
    const order = orderResult.rows?.[0];
    if (!order) throw conflict('ORDER_NOT_FOUND', 'Order not found');

    const reportResult = await client.query(
      `insert into reports (
        id, reporter_id, reported_user_id, order_id, conversation_id,
        target_type, target_id, category, description, evidence_files, status
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
      returning *`,
      [
        draft.reportId,
        draft.reporterId,
        draft.reportedUserId || null,
        draft.orderId,
        draft.conversationId || null,
        draft.targetType || 'order',
        draft.targetId || draft.orderId,
        draft.category || 'Order dispute',
        draft.description || '',
        draft.evidenceFiles || [],
      ],
    );

    const auditCaseResult = await client.query(
      `insert into audit_cases (
        id, target_type, target_id, status, risk_level, submitted_by, reason, snapshot
      ) values ($1, 'report', $2, 'pending', $3, $4, $5, $6)
      returning *`,
      [
        draft.auditCaseId,
        draft.reportId,
        draft.riskLevel || 'medium',
        draft.reporterId,
        draft.category || 'Order dispute',
        {
          reportId: draft.reportId,
          orderId: order.id,
          reporterId: draft.reporterId,
          reportedUserId: draft.reportedUserId || null,
        },
      ],
    );

    await client.query('commit');
    return {
      report: reportResult.rows?.[0] || null,
      auditCase: auditCaseResult.rows?.[0] || null,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function applyModerationActionTransaction(client, draft) {
  assertClient(client);
  assertModerationDraft(draft);

  await client.query('begin');
  try {
    const context = await findModerationContext(client, draft);
    if (!context) throw conflict('MODERATION_CASE_NOT_FOUND', 'Moderation case not found');

    await client.query(
      `insert into admin_action_logs (
        id, admin_id, action, target_type, target_id, before_data, after_data
      ) values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        draft.adminActionLogId,
        draft.adminId || null,
        draft.actionType,
        context.targetType,
        context.targetId,
        context.beforeData,
        { note: draft.note || '', actionType: draft.actionType },
      ],
    );

    if (context.kind === 'risk') {
      await client.query(
        `update message_risk_events
         set review_status = $1,
             reviewed_by = $2,
             reviewed_at = $3
         where id = $4`,
        [nextRiskReviewStatus(draft.actionType), draft.adminId || null, draft.reviewedAt || new Date().toISOString(), draft.caseId],
      );
    }

    if (context.kind === 'report') {
      await client.query(
        `update reports
         set status = $1,
             handled_by = $2,
             handled_at = $3,
             result = $4,
             updated_at = now()
         where id = $5`,
        [nextReportStatus(draft.actionType), draft.adminId || null, draft.reviewedAt || new Date().toISOString(), draft.note || null, draft.caseId],
      );
    }

    if (draft.actionType === 'freeze_order' && context.orderId) {
      await client.query(
        `update orders
         set status = 'disputed',
             updated_at = now()
         where id = $1`,
        [context.orderId],
      );
    }

    if (draft.actionType === 'restrict_chat' && context.orderId) {
      await client.query(
        `update conversations
         set status = 'restricted',
             restricted_reason = $1,
             updated_at = now()
         where order_id = $2`,
        [draft.note || 'Restricted by moderation', context.orderId],
      );
    }

    await client.query('commit');
    return {
      kind: context.kind,
      caseId: draft.caseId,
      orderId: context.orderId,
      actionType: draft.actionType,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function findModerationContext(client, draft) {
  const riskResult = await client.query(
    `select id, order_id, review_status, raw_payload
     from message_risk_events
     where id = $1
     for update`,
    [draft.caseId],
  );
  const risk = riskResult.rows?.[0];
  if (risk) {
    return {
      kind: 'risk',
      targetType: 'message_risk_event',
      targetId: draft.caseId,
      orderId: risk.order_id,
      beforeData: risk,
    };
  }

  const reportResult = await client.query(
    `select id, order_id, status, result
     from reports
     where id = $1
     for update`,
    [draft.caseId],
  );
  const report = reportResult.rows?.[0];
  if (!report) return null;
  return {
    kind: 'report',
    targetType: 'report',
    targetId: draft.caseId,
    orderId: report.order_id,
    beforeData: report,
  };
}

function nextRiskReviewStatus(actionType) {
  if (actionType === 'release_message') return 'released';
  if (actionType === 'confirm_violation') return 'violation';
  if (actionType === 'restrict_chat') return 'restricted';
  return 'reviewed';
}

function nextReportStatus(actionType) {
  if (actionType === 'resolve_report') return 'resolved';
  if (actionType === 'confirm_violation' || actionType === 'freeze_order') return 'investigating';
  return 'investigating';
}

function assertClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('PostgreSQL client with query(sql, params) is required');
  }
}

function assertReportDraft(draft) {
  const required = ['reportId', 'auditCaseId', 'reporterId', 'orderId'];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (missing.length) throw new Error(`Missing createReport draft fields: ${missing.join(', ')}`);
}

function assertModerationDraft(draft) {
  const required = ['caseId', 'actionType', 'adminActionLogId'];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (missing.length) throw new Error(`Missing moderation action draft fields: ${missing.join(', ')}`);
}

function conflict(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  return error;
}
