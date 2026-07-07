import { applyModerationActionTransaction, createReportTransaction, reviewAuditCaseTransaction } from '../store/postgresModerationWrites.mjs';

const ids = {
  orderId: '00000000-0000-4000-8000-000000000201',
  userId: '00000000-0000-4000-8000-000000000202',
  companionId: '00000000-0000-4000-8000-000000000203',
  reportId: '00000000-0000-4000-8000-000000000204',
  auditCaseId: '00000000-0000-4000-8000-000000000205',
  riskCaseId: '00000000-0000-4000-8000-000000000206',
  adminActionLogId: '00000000-0000-4000-8000-000000000207',
  adminId: '00000000-0000-4000-8000-000000000208',
};

const reportClient = createMockClient({ mode: 'report-create' });
const report = await createReportTransaction(reportClient, {
  reportId: ids.reportId,
  auditCaseId: ids.auditCaseId,
  reporterId: ids.userId,
  reportedUserId: ids.companionId,
  orderId: ids.orderId,
  category: 'Order dispute',
  description: 'Need moderation review',
});
const reportSql = reportClient.calls.map((call) => call.sql);
assert(report.report?.id === ids.reportId, 'returns report');
assert(report.auditCase?.id === ids.auditCaseId, 'returns audit case');
assert(reportSql[0] === 'begin', 'report transaction begins');
assert(reportSql.some((sql) => /insert into reports/i.test(sql)), 'inserts report');
assert(reportSql.some((sql) => /insert into audit_cases/i.test(sql)), 'inserts audit case');
assert(reportSql.at(-1) === 'commit', 'report transaction commits');

const riskClient = createMockClient({ mode: 'risk-action' });
const riskAction = await applyModerationActionTransaction(riskClient, {
  caseId: ids.riskCaseId,
  actionType: 'restrict_chat',
  adminActionLogId: ids.adminActionLogId,
  adminId: ids.adminId,
  note: 'Restrict chat for contact exchange',
});
const riskSql = riskClient.calls.map((call) => call.sql);
assert(riskAction.kind === 'risk', 'risk action returns risk kind');
assert(riskSql.some((sql) => /from message_risk_events/i.test(sql) && /for update/i.test(sql)), 'locks risk case');
assert(riskSql.some((sql) => /insert into admin_action_logs/i.test(sql)), 'writes admin action log');
assert(riskSql.some((sql) => /update message_risk_events/i.test(sql)), 'updates risk review status');
assert(riskSql.some((sql) => /update conversations/i.test(sql) && /status = 'restricted'/i.test(sql)), 'restricts conversation');
assert(riskSql.at(-1) === 'commit', 'risk moderation commits');

const freezeClient = createMockClient({ mode: 'report-action' });
const freezeAction = await applyModerationActionTransaction(freezeClient, {
  caseId: ids.reportId,
  actionType: 'freeze_order',
  adminActionLogId: '00000000-0000-4000-8000-000000000209',
  adminId: ids.adminId,
  note: 'Freeze order while investigating',
});
const freezeSql = freezeClient.calls.map((call) => call.sql);
assert(freezeAction.kind === 'report', 'freeze action returns report kind');
assert(freezeSql.some((sql) => /from reports/i.test(sql) && /for update/i.test(sql)), 'locks report case');
assert(freezeSql.some((sql) => /update reports/i.test(sql)), 'updates report status');
assert(freezeSql.some((sql) => /update orders/i.test(sql) && /status = 'disputed'/i.test(sql)), 'freezes order');
assert(freezeSql.at(-1) === 'commit', 'freeze moderation commits');

const missingClient = createMockClient({ mode: 'missing' });
await assertRejects(
  () =>
    applyModerationActionTransaction(missingClient, {
      caseId: ids.reportId,
      actionType: 'freeze_order',
      adminActionLogId: '00000000-0000-4000-8000-000000000210',
    }),
  'Moderation case not found',
  'missing case rejects',
);
assert(missingClient.calls.at(-1).sql === 'rollback', 'missing case rolls back');

const reviewReportClient = createMockClient({ mode: 'audit-report' });
const reviewedReport = await reviewAuditCaseTransaction(reviewReportClient, {
  caseId: ids.auditCaseId,
  nextStatus: 'approved',
  auditLogId: '00000000-0000-4000-8000-000000000211',
  adminActionLogId: '00000000-0000-4000-8000-000000000212',
  adminId: ids.adminId,
  note: 'Report resolved',
});
const reviewReportSql = reviewReportClient.calls.map((call) => call.sql);
assert(reviewedReport.nextStatus === 'approved', 'audit review returns next status');
assert(reviewReportSql.some((sql) => /from audit_cases/i.test(sql) && /for update/i.test(sql)), 'audit review locks case');
assert(reviewReportSql.some((sql) => /update audit_cases/i.test(sql)), 'audit review updates case');
assert(reviewReportSql.some((sql) => /insert into audit_logs/i.test(sql)), 'audit review writes audit log');
assert(reviewReportSql.some((sql) => /update reports/i.test(sql) && /status = \$1/i.test(sql)), 'audit review updates report target');
assert(reviewReportSql.some((sql) => /insert into admin_action_logs/i.test(sql)), 'audit review writes admin action log');
assert(reviewReportSql.at(-1) === 'commit', 'audit review commits');

const reviewPostClient = createMockClient({ mode: 'audit-post' });
await reviewAuditCaseTransaction(reviewPostClient, {
  caseId: ids.auditCaseId,
  nextStatus: 'approved',
  auditLogId: '00000000-0000-4000-8000-000000000213',
  adminActionLogId: '00000000-0000-4000-8000-000000000214',
});
const reviewPostSql = reviewPostClient.calls.map((call) => call.sql);
assert(reviewPostSql.some((sql) => /update posts/i.test(sql) && /is_feed_visible/i.test(sql)), 'audit review updates post visibility');

const reviewCompanionClient = createMockClient({ mode: 'audit-companion' });
await reviewAuditCaseTransaction(reviewCompanionClient, {
  caseId: ids.auditCaseId,
  nextStatus: 'rejected',
  auditLogId: '00000000-0000-4000-8000-000000000215',
  adminActionLogId: '00000000-0000-4000-8000-000000000216',
});
const reviewCompanionSql = reviewCompanionClient.calls.map((call) => call.sql);
assert(reviewCompanionSql.some((sql) => /update companions/i.test(sql) && /service_enabled/i.test(sql)), 'audit review updates companion service status');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'create-report',
        'audit-case',
        'risk-action',
        'restrict-chat',
        'report-action',
        'freeze-order',
        'missing-rollback',
        'review-audit-case',
        'review-audit-log',
        'review-admin-action-log',
        'review-report-target',
        'review-post-target',
        'review-companion-target',
      ],
      reportQueryCount: reportClient.calls.length,
      riskQueryCount: riskClient.calls.length,
      freezeQueryCount: freezeClient.calls.length,
      reviewQueryCount: reviewReportClient.calls.length + reviewPostClient.calls.length + reviewCompanionClient.calls.length,
    },
    null,
    2,
  ),
);

function createMockClient({ mode }) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      calls.push({ sql: normalized, params });
      if (/from orders/i.test(normalized)) return { rows: [{ id: ids.orderId, user_id: ids.userId, companion_id: ids.companionId }] };
      if (/insert into reports/i.test(normalized)) return { rows: [{ id: params[0], status: 'pending' }] };
      if (/insert into audit_cases/i.test(normalized)) return { rows: [{ id: params[0], target_type: 'report' }] };
      if (/from message_risk_events/i.test(normalized)) {
        return mode === 'risk-action' ? { rows: [{ id: ids.riskCaseId, order_id: ids.orderId, review_status: 'pending', raw_payload: {} }] } : { rows: [] };
      }
      if (/from reports/i.test(normalized)) {
        return mode === 'report-action' ? { rows: [{ id: ids.reportId, order_id: ids.orderId, status: 'pending' }] } : { rows: [] };
      }
      if (/from audit_cases/i.test(normalized)) {
        const targetType = mode === 'audit-post' ? 'post' : mode === 'audit-companion' ? 'companion' : 'report';
        const targetId = targetType === 'companion' ? ids.companionId : targetType === 'post' ? ids.riskCaseId : ids.reportId;
        return mode.startsWith('audit-') ? { rows: [{ id: ids.auditCaseId, target_type: targetType, target_id: targetId, status: 'pending' }] } : { rows: [] };
      }
      if (/update audit_cases/i.test(normalized)) return { rows: [{ id: params[3], status: params[0], reviewed_at: params[2] }] };
      return { rows: [] };
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres moderation write check failed: ${message}`);
}

async function assertRejects(fn, messagePart, label) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(messagePart), label);
    return;
  }
  throw new Error(`Postgres moderation write check failed: ${label}`);
}
