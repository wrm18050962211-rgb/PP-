import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  StoreLiteComplianceGatewayError,
  blockCompanionForConsumer,
  cancelUserRequestForConsumer,
  completeUserRequestForAdmin,
  createContentReportForConsumer,
  createUserRequestForConsumer,
  declineUserRequestForAdmin,
  getContentReportDetailForAdmin,
  getContentReportDetailForConsumer,
  getUserRequestDetailForAdmin,
  getUserRequestDetailForConsumer,
  investigateContentReportForAdmin,
  listBlockedCompanionIdsForConsumer,
  listBlockedCompanionsForConsumer,
  listContentReportsForAdmin,
  listContentReportsForConsumer,
  listUserRequestsForAdmin,
  listUserRequestsForConsumer,
  rejectContentReportForAdmin,
  resolveContentReportForAdmin,
  startUserRequestForAdmin,
  unblockCompanionForConsumer,
} from '../store/postgresStoreLiteCompliance.mjs';

const ids = Object.freeze({
  user: '00000000-0000-4000-8000-000000000001',
  otherUser: '00000000-0000-4000-8000-000000000002',
  admin: '00000000-0000-4000-8000-000000000003',
  otherAdmin: '00000000-0000-4000-8000-000000000004',
  companion: '00000000-0000-4000-8000-000000000005',
  companion2: '00000000-0000-4000-8000-000000000006',
  booking: '00000000-0000-4000-8000-000000000007',
  request: '00000000-0000-4000-8000-000000000008',
  request2: '00000000-0000-4000-8000-000000000009',
  report: '00000000-0000-4000-8000-00000000000a',
  report2: '00000000-0000-4000-8000-00000000000b',
  post: '00000000-0000-4000-8000-00000000000c',
  block: '00000000-0000-4000-8000-00000000000d',
  block2: '00000000-0000-4000-8000-00000000000e',
  log: '00000000-0000-4000-8000-00000000000f',
  action: '00000000-0000-4000-8000-000000000010',
});

const requestInput = Object.freeze({
  userRequestId: ids.request,
  statusLogId: ids.log,
  userId: ids.user,
  requestType: 'support',
  supportCategory: 'booking',
  bookingRequestId: ids.booking,
  description: '需要确认预约申请的到店说明。',
  clientRequestId: 'support-request-0001',
});

const reportInput = Object.freeze({
  reportId: ids.report,
  userId: ids.user,
  targetType: 'post',
  targetId: ids.post,
  category: 'content_violation',
  description: '该作品说明可能误导用户。',
  clientRequestId: 'content-report-0001',
});

await checkUserRequestCreateReplayAndConflicts();
await checkUserRequestReadsAndCursor();
await checkUserRequestConsumerCancel();
await checkUserRequestAdminReadsAndTransitions();
await checkContentReportCreateReplayAndValidation();
await checkContentReportReadsAndCursor();
await checkContentReportAdminTransitions();
await checkCompanionBlocks();
await checkStableFailuresAndStaticSafety();

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'user-request-create-and-table-local-idempotency',
        'active-account-deletion-conflict',
        'user-request-owner-reads',
        'user-request-actor-and-filter-bound-cursor',
        'user-request-consumer-cancel',
        'user-request-admin-state-machine-and-audit',
        'account-deletion-admin-completion-denied',
        'content-report-target-resolution-and-idempotency',
        'content-report-owner-reads',
        'content-report-admin-state-machine-and-audit',
        'content-removal-and-companion-suspension',
        'companion-block-list-put-delete',
        'public-dto-redaction',
        'stable-sanitized-errors',
      ],
    },
    null,
    2,
  ),
);

async function checkUserRequestCreateReplayAndConflicts() {
  let fingerprint;
  const createdRow = userRequestRow();
  const createClient = scriptedClient([
    step(/^begin$/i),
    step(/select id, request_fingerprint[\s\S]+from user_requests/i, { rows: [] }),
    step(/from booking_requests[\s\S]+user_id = \$2::uuid[\s\S]+for share/i, { rows: [{ id: ids.booking }] }),
    step(/insert into user_requests[\s\S]+on conflict do nothing/i, { rows: [{ id: ids.request }] }, (params) => {
      assert.equal(params[0], ids.request);
      assert.equal(params[1], ids.user);
      assert.equal(params[2], 'support');
      assert.equal(params[3], 'booking');
      assert.equal(params[4], ids.booking);
      fingerprint = params[7];
      assert.match(fingerprint, /^[a-f0-9]{64}$/);
    }),
    step(/insert into user_request_status_logs/i, { rows: [] }, (params) => {
      assert.equal(params[1], ids.request);
      assert.equal(params[2], null);
      assert.equal(params[3], 'submitted');
      assert.equal(params[4], 'user');
      assert.equal(params[5], ids.user);
      assert.equal(params[6], null);
    }),
    step(/from user_requests r[\s\S]+r\.user_id = \$2::uuid/i, { rows: [createdRow] }),
    step(/from user_request_status_logs/i, { rows: [userRequestStatusLog(null, 'submitted', 'user')] }),
    step(/^commit$/i),
  ]);
  const created = await createUserRequestForConsumer(createClient, requestInput);
  assert.equal(created.id, ids.request);
  assert.equal(created.status, 'submitted');
  assertPublicDto(created);
  createClient.assertDone();

  const replayClient = scriptedClient([
    step(/^begin$/i),
    step(/select id, request_fingerprint[\s\S]+from user_requests/i, {
      rows: [{ id: ids.request, request_fingerprint: fingerprint }],
    }),
    step(/from user_requests r[\s\S]+r\.user_id = \$2::uuid/i, { rows: [createdRow] }),
    step(/from user_request_status_logs/i, { rows: [userRequestStatusLog(null, 'submitted', 'user')] }),
    step(/^commit$/i),
  ]);
  const replayed = await createUserRequestForConsumer(replayClient, requestInput);
  assert.deepEqual(replayed, created);
  assert.equal(replayClient.calls.some((call) => /booking_requests|insert into user_requests/i.test(call.sql)), false);
  replayClient.assertDone();

  const conflictClient = scriptedClient([
    step(/^begin$/i),
    step(/select id, request_fingerprint[\s\S]+from user_requests/i, {
      rows: [{ id: ids.request, request_fingerprint: '0'.repeat(64) }],
    }),
    step(/^rollback$/i),
  ]);
  await expectGatewayError(
    () => createUserRequestForConsumer(conflictClient, requestInput),
    'USER_REQUEST_IDEMPOTENCY_CONFLICT',
    409,
  );
  conflictClient.assertDone();

  const activeDeletionClient = scriptedClient([
    step(/^begin$/i),
    step(/select id, request_fingerprint[\s\S]+from user_requests/i, { rows: [] }),
    step(/request_type = 'account_deletion'[\s\S]+status in/i, { rows: [{ id: ids.request2 }] }),
    step(/^rollback$/i),
  ]);
  await expectGatewayError(
    () => createUserRequestForConsumer(activeDeletionClient, {
      userRequestId: ids.request,
      statusLogId: ids.log,
      userId: ids.user,
      requestType: 'account_deletion',
      clientRequestId: 'delete-request-0001',
    }),
    'USER_REQUEST_STATUS_CONFLICT',
    409,
  );
  activeDeletionClient.assertDone();
}

async function checkUserRequestReadsAndCursor() {
  const first = userRequestRow({
    created_at_cursor: '2026-08-23T10:00:00.000900Z',
    created_at: '2026-08-23T10:00:00.000Z',
  });
  const second = userRequestRow({
    id: ids.request2,
    created_at_cursor: '2026-08-23T10:00:00.000100Z',
    created_at: '2026-08-23T10:00:00.000Z',
  });
  const listClient = scriptedClient([
    step(/r\.user_id = \$1::uuid[\s\S]+limit \$6/i, { rows: [first, second] }, (params) => {
      assert.deepEqual(params, [ids.user, null, null, null, null, 2]);
    }),
  ]);
  const page = await listUserRequestsForConsumer(listClient, { userId: ids.user, limit: 1 });
  assert.equal(page.items.length, 1);
  assert.equal(page.hasMore, true);
  assert.ok(page.nextCursor);
  assertPublicDto(page.items[0]);
  listClient.assertDone();

  const nextClient = scriptedClient([
    step(/\(r\.created_at, r\.id\) < \(\$4::timestamptz, \$5::uuid\)/i, { rows: [] }, (params) => {
      assert.equal(params[3], '2026-08-23T10:00:00.000900Z');
      assert.equal(params[4], ids.request);
    }),
  ]);
  await listUserRequestsForConsumer(nextClient, {
    userId: ids.user,
    limit: 1,
    cursor: page.nextCursor,
  });
  nextClient.assertDone();

  await expectGatewayError(
    () => listUserRequestsForConsumer(noQueryClient(), { userId: ids.otherUser, cursor: page.nextCursor }),
    'USER_REQUEST_CURSOR_INVALID',
    400,
  );
  await expectGatewayError(
    () => listUserRequestsForConsumer(noQueryClient(), {
      userId: ids.user,
      status: 'submitted',
      cursor: page.nextCursor,
    }),
    'USER_REQUEST_CURSOR_INVALID',
    400,
  );

  const detailClient = scriptedClient([
    step(/r\.id = \$1::uuid[\s\S]+r\.user_id = \$2::uuid/i, { rows: [first] }, (params) => {
      assert.deepEqual(params, [ids.request, ids.user]);
    }),
    step(/from user_request_status_logs/i, { rows: [userRequestStatusLog(null, 'submitted', 'user')] }),
  ]);
  const detail = await getUserRequestDetailForConsumer(detailClient, {
    userId: ids.user,
    userRequestId: ids.request,
  });
  assertPublicDto(detail);
  assert.deepEqual(Object.keys(detail.statusLogs[0]).sort(), [
    'actorType',
    'createdAt',
    'fromStatus',
    'id',
    'publicMessage',
    'reasonCode',
    'toStatus',
  ]);
  detailClient.assertDone();

  const hiddenClient = scriptedClient([
    step(/r\.user_id = \$2::uuid/i, { rows: [] }),
  ]);
  await expectGatewayError(
    () => getUserRequestDetailForConsumer(hiddenClient, {
      userId: ids.user,
      userRequestId: ids.request2,
    }),
    'USER_REQUEST_NOT_FOUND',
    404,
  );
  hiddenClient.assertDone();
}

async function checkUserRequestConsumerCancel() {
  const before = userRequestRow({ status: 'submitted' });
  const after = userRequestRow({ status: 'cancelled', cancelled_at: '2026-08-23T11:00:00.000Z' });
  const client = scriptedClient([
    step(/^begin$/i),
    step(/select r\.\*[\s\S]+r\.user_id = \$2::uuid[\s\S]+for update/i, { rows: [before] }),
    step(/update user_requests[\s\S]+cancelled_at = now\(\)[\s\S]+status = \$2::user_request_status/i, {
      rows: [after],
    }, (params) => {
      assert.deepEqual(params, [ids.request, 'submitted', 'cancelled']);
    }),
    step(/insert into user_request_status_logs/i, { rows: [] }, (params) => {
      assert.equal(params[4], 'user');
      assert.equal(params[5], ids.user);
      assert.equal(params[6], null);
    }),
    step(/from user_requests r[\s\S]+r\.user_id = \$2::uuid/i, { rows: [after] }),
    step(/from user_request_status_logs/i, { rows: [userRequestStatusLog('submitted', 'cancelled', 'user')] }),
    step(/^commit$/i),
  ]);
  const result = await cancelUserRequestForConsumer(client, {
    userId: ids.user,
    userRequestId: ids.request,
    statusLogId: ids.log,
    reasonCode: 'withdrawn',
    reason: '暂时不需要继续处理。',
  });
  assert.equal(result.status, 'cancelled');
  assert.equal(client.calls.some((call) => /admin_action_logs/i.test(call.sql)), false);
  assertPublicDto(result);
  client.assertDone();
}

async function checkUserRequestAdminReadsAndTransitions() {
  const row = userRequestRow();
  const listClient = scriptedClient([
    step(/from user_requests r[\s\S]+limit \$5/i, { rows: [row] }, (params) => {
      assert.deepEqual(params, [null, null, null, null, 21]);
    }),
  ]);
  const page = await listUserRequestsForAdmin(listClient, { adminId: ids.admin });
  assert.equal(page.items[0].user.id, ids.user);
  assert.equal(page.items[0].user.nickname, '测试用户');
  assertPublicDto(page.items[0]);
  listClient.assertDone();

  const detailClient = scriptedClient([
    step(/from user_requests r[\s\S]+where r\.id = \$1::uuid[\s\S]+limit 1/i, { rows: [row] }),
    step(/from user_request_status_logs/i, { rows: [userRequestStatusLog(null, 'submitted', 'user')] }),
  ]);
  const detail = await getUserRequestDetailForAdmin(detailClient, {
    adminId: ids.admin,
    userRequestId: ids.request,
  });
  assertPublicDto(detail);
  detailClient.assertDone();

  const processing = userRequestRow({ status: 'processing', processing_at: '2026-08-23T11:00:00.000Z' });
  const startedClient = userRequestAdminTransitionClient(row, processing, 'processing');
  const started = await startUserRequestForAdmin(startedClient, adminUserRequestInput());
  assert.equal(started.status, 'processing');
  assertAdminAuditBeforeCommit(startedClient, 'user_request.processing');
  startedClient.assertDone();

  const completed = userRequestRow({
    status: 'completed',
    processing_at: '2026-08-23T11:00:00.000Z',
    completed_at: '2026-08-23T12:00:00.000Z',
  });
  const completedClient = userRequestAdminTransitionClient(processing, completed, 'completed');
  await completeUserRequestForAdmin(completedClient, {
    ...adminUserRequestInput(),
    publicMessage: '请求已经处理完成。',
  });
  assertAdminAuditBeforeCommit(completedClient, 'user_request.completed');
  completedClient.assertDone();

  const declined = userRequestRow({
    status: 'declined',
    declined_at: '2026-08-23T12:00:00.000Z',
  });
  const declinedClient = userRequestAdminTransitionClient(row, declined, 'declined');
  await declineUserRequestForAdmin(declinedClient, {
    ...adminUserRequestInput(),
    reasonCode: 'cannot_process',
    publicMessage: '当前信息不足，暂时无法处理。',
  });
  assertAdminAuditBeforeCommit(declinedClient, 'user_request.declined');
  declinedClient.assertDone();

  const deletionClient = scriptedClient([
    step(/^begin$/i),
    step(/select r\.\*[\s\S]+for update/i, {
      rows: [userRequestRow({
        request_type: 'account_deletion',
        support_category: null,
        booking_request_id: null,
        status: 'processing',
        processing_at: '2026-08-23T11:00:00.000Z',
      })],
    }),
    step(/^rollback$/i),
  ]);
  await expectGatewayError(
    () => completeUserRequestForAdmin(deletionClient, {
      ...adminUserRequestInput(),
      publicMessage: '删除完成。',
    }),
    'USER_REQUEST_STATUS_CONFLICT',
    409,
  );
  deletionClient.assertDone();
}

async function checkContentReportCreateReplayAndValidation() {
  let fingerprint;
  const row = contentReportRow();
  const createClient = scriptedClient([
    step(/^begin$/i),
    step(/select id, request_fingerprint[\s\S]+from reports/i, { rows: [] }),
    step(/from posts p[\s\S]+for share/i, {
      rows: [{ target_id: ids.post, companion_id: ids.companion, reported_user_id: ids.otherUser }],
    }),
    step(/insert into reports[\s\S]+report_context[\s\S]+on conflict \(reporter_id, client_request_id\)/i, {
      rows: [{ id: ids.report }],
    }, (params) => {
      assert.equal(params[1], ids.user);
      assert.equal(params[2], ids.otherUser);
      assert.equal(params[3], 'post');
      assert.equal(params[4], ids.post);
      fingerprint = params[8];
      assert.match(fingerprint, /^[a-f0-9]{64}$/);
    }),
    step(/from reports r[\s\S]+r\.reporter_id = \$2::uuid/i, { rows: [row] }),
    step(/^commit$/i),
  ]);
  const created = await createContentReportForConsumer(createClient, reportInput);
  assert.equal(created.status, 'pending');
  assertPublicDto(created);
  createClient.assertDone();

  const replayClient = scriptedClient([
    step(/^begin$/i),
    step(/select id, request_fingerprint[\s\S]+from reports/i, {
      rows: [{ id: ids.report, request_fingerprint: fingerprint }],
    }),
    step(/from reports r[\s\S]+r\.reporter_id = \$2::uuid/i, { rows: [row] }),
    step(/^commit$/i),
  ]);
  const replayed = await createContentReportForConsumer(replayClient, reportInput);
  assert.deepEqual(replayed, created);
  assert.equal(replayClient.calls.some((call) => /from posts p|insert into reports/i.test(call.sql)), false);
  replayClient.assertDone();

  const conflictClient = scriptedClient([
    step(/^begin$/i),
    step(/select id, request_fingerprint[\s\S]+from reports/i, {
      rows: [{ id: ids.report, request_fingerprint: '0'.repeat(64) }],
    }),
    step(/^rollback$/i),
  ]);
  await expectGatewayError(
    () => createContentReportForConsumer(conflictClient, reportInput),
    'CONTENT_REPORT_IDEMPOTENCY_CONFLICT',
    409,
  );
  conflictClient.assertDone();

  const selfClient = scriptedClient([
    step(/^begin$/i),
    step(/select id, request_fingerprint[\s\S]+from reports/i, { rows: [] }),
    step(/from posts p[\s\S]+for share/i, {
      rows: [{ target_id: ids.post, companion_id: ids.companion, reported_user_id: ids.user }],
    }),
    step(/^rollback$/i),
  ]);
  await expectGatewayError(
    () => createContentReportForConsumer(selfClient, {
      ...reportInput,
      clientRequestId: 'content-report-self',
    }),
    'CONTENT_REPORT_INVALID',
    400,
  );
  selfClient.assertDone();
}

async function checkContentReportReadsAndCursor() {
  const first = contentReportRow({ created_at_cursor: '2026-08-23T10:00:00.000900Z' });
  const second = contentReportRow({
    id: ids.report2,
    created_at_cursor: '2026-08-23T10:00:00.000100Z',
  });
  const listClient = scriptedClient([
    step(/r\.reporter_id = \$1::uuid[\s\S]+limit \$6/i, { rows: [first, second] }, (params) => {
      assert.deepEqual(params, [ids.user, null, null, null, null, 2]);
    }),
  ]);
  const page = await listContentReportsForConsumer(listClient, { userId: ids.user, limit: 1 });
  assert.ok(page.nextCursor);
  assertPublicDto(page.items[0]);
  assert.doesNotMatch(listClient.calls[0].sql, /reported_user_id|evidence_files|request_fingerprint|handled_by/i);
  listClient.assertDone();

  const nextClient = scriptedClient([
    step(/\(r\.created_at, r\.id\) < \(\$4::timestamptz, \$5::uuid\)/i, { rows: [] }, (params) => {
      assert.equal(params[3], '2026-08-23T10:00:00.000900Z');
      assert.equal(params[4], ids.report);
    }),
  ]);
  await listContentReportsForConsumer(nextClient, {
    userId: ids.user,
    limit: 1,
    cursor: page.nextCursor,
  });
  nextClient.assertDone();

  await expectGatewayError(
    () => listContentReportsForConsumer(noQueryClient(), {
      userId: ids.otherUser,
      cursor: page.nextCursor,
    }),
    'CONTENT_REPORT_CURSOR_INVALID',
    400,
  );

  const detailClient = scriptedClient([
    step(/r\.id = \$1::uuid[\s\S]+r\.reporter_id = \$2::uuid/i, { rows: [first] }),
  ]);
  const detail = await getContentReportDetailForConsumer(detailClient, {
    userId: ids.user,
    reportId: ids.report,
  });
  assertPublicDto(detail);
  detailClient.assertDone();

  const adminListClient = scriptedClient([
    step(/join users reporter[\s\S]+limit \$6/i, { rows: [first] }, (params) => {
      assert.deepEqual(params, [null, null, null, null, null, 21]);
    }),
  ]);
  const adminPage = await listContentReportsForAdmin(adminListClient, { adminId: ids.admin });
  assert.equal(adminPage.items[0].reporter.id, ids.user);
  assert.equal(adminPage.items[0].reporter.nickname, '测试用户');
  assert.equal(adminPage.items[0].target.targetType, 'post');
  assert.equal(adminPage.items[0].target.displayName, '示例作品说明');
  assertAdminDto(adminPage.items[0]);
  adminListClient.assertDone();

  const adminDetailClient = scriptedClient([
    step(/join users reporter[\s\S]+where r\.id = \$1::uuid/i, { rows: [first] }),
  ]);
  const adminDetail = await getContentReportDetailForAdmin(adminDetailClient, {
    adminId: ids.admin,
    reportId: ids.report,
  });
  assertAdminDto(adminDetail);
  adminDetailClient.assertDone();
}

async function checkContentReportAdminTransitions() {
  const pending = contentReportRow({ status: 'pending' });
  const investigating = contentReportRow({ status: 'investigating' });
  const investigateClient = reportAdminTransitionClient(pending, investigating, 'investigating');
  await investigateContentReportForAdmin(investigateClient, adminReportInput());
  assertAdminAuditBeforeCommit(investigateClient, 'content_report.investigating');
  investigateClient.assertDone();

  const resolved = contentReportRow({
    status: 'resolved',
    result: JSON.stringify({ resolutionAction: 'remove_post', publicMessage: '违规作品已下架。' }),
    handled_by: ids.admin,
    handled_at: '2026-08-23T12:00:00.000Z',
  });
  const resolvePostClient = reportAdminTransitionClient(investigating, resolved, 'resolved', 'remove_post');
  const resolvedPost = await resolveContentReportForAdmin(resolvePostClient, {
    ...adminReportInput(),
    resolutionAction: 'remove_post',
    publicMessage: '违规作品已下架。',
  });
  assert.deepEqual(resolvedPost.result, {
    resolutionAction: 'remove_post',
    publicMessage: '违规作品已下架。',
  });
  assert.equal(resolvedPost.handledByAdminId, ids.admin);
  assertAdminAuditBeforeCommit(resolvePostClient, 'content_report.resolved');
  const postUpdateIndex = resolvePostClient.calls.findIndex((call) => /update posts/i.test(call.sql));
  const reportUpdateIndex = resolvePostClient.calls.findIndex((call) => /update reports/i.test(call.sql));
  assert.ok(postUpdateIndex > 0 && reportUpdateIndex > postUpdateIndex);
  resolvePostClient.assertDone();

  const companionPending = contentReportRow({
    target_type: 'companion',
    target_id: ids.companion,
    status: 'pending',
  });
  const companionResolved = contentReportRow({
    target_type: 'companion',
    target_id: ids.companion,
    status: 'resolved',
    result: JSON.stringify({ resolutionAction: 'suspend_companion', publicMessage: '摄影师资料已暂停展示。' }),
    handled_by: ids.admin,
    handled_at: '2026-08-23T12:00:00.000Z',
  });
  const suspendClient = reportAdminTransitionClient(companionPending, companionResolved, 'resolved', 'suspend_companion');
  await resolveContentReportForAdmin(suspendClient, {
    ...adminReportInput(),
    resolutionAction: 'suspend_companion',
    publicMessage: '摄影师资料已暂停展示。',
  });
  assert.ok(suspendClient.calls.some((call) => /update companions[\s\S]+service_enabled = false/i.test(call.sql)));
  suspendClient.assertDone();

  const rejected = contentReportRow({
    status: 'rejected',
    result: JSON.stringify({ resolutionAction: 'no_action', publicMessage: '未发现违规。' }),
    handled_by: ids.admin,
    handled_at: '2026-08-23T12:00:00.000Z',
  });
  const rejectClient = reportAdminTransitionClient(pending, rejected, 'rejected');
  await rejectContentReportForAdmin(rejectClient, {
    ...adminReportInput(),
    publicMessage: '未发现违规。',
  });
  assert.equal(rejectClient.calls.some((call) => /update posts|update companions/i.test(call.sql)), false);
  rejectClient.assertDone();

  const mismatchClient = scriptedClient([
    step(/^begin$/i),
    step(/select r\.id, r\.status, r\.target_type, r\.target_id[\s\S]+for update/i, {
      rows: [{ id: ids.report, status: 'pending', target_type: 'post', target_id: ids.post }],
    }),
    step(/^rollback$/i),
  ]);
  await expectGatewayError(
    () => resolveContentReportForAdmin(mismatchClient, {
      ...adminReportInput(),
      resolutionAction: 'suspend_companion',
      publicMessage: '处理完成。',
    }),
    'CONTENT_REPORT_RESOLUTION_INVALID',
    400,
  );
  mismatchClient.assertDone();
}

async function checkCompanionBlocks() {
  const first = blockRow({ created_at_cursor: '2026-08-23T10:00:00.000900Z' });
  const second = blockRow({
    id: ids.block2,
    companion_id: ids.companion2,
    created_at_cursor: '2026-08-23T10:00:00.000100Z',
  });
  const listClient = scriptedClient([
    step(/from user_companion_blocks b[\s\S]+b\.user_id = \$1::uuid[\s\S]+limit \$4/i, {
      rows: [first, second],
    }),
  ]);
  const page = await listBlockedCompanionsForConsumer(listClient, { userId: ids.user, limit: 1 });
  assert.ok(page.nextCursor);
  assert.equal(page.items[0].companionId, ids.companion);
  assertPublicDto(page.items[0]);
  listClient.assertDone();

  await expectGatewayError(
    () => listBlockedCompanionsForConsumer(noQueryClient(), {
      userId: ids.otherUser,
      cursor: page.nextCursor,
    }),
    'COMPANION_BLOCK_CURSOR_INVALID',
    400,
  );

  const idClient = scriptedClient([
    step(/select companion_id[\s\S]+where user_id = \$1::uuid/i, {
      rows: [{ companion_id: ids.companion }, { companion_id: ids.companion2 }],
    }),
  ]);
  assert.deepEqual(
    await listBlockedCompanionIdsForConsumer(idClient, { userId: ids.user }),
    [ids.companion, ids.companion2],
  );
  idClient.assertDone();

  const putClient = scriptedClient([
    step(/^begin$/i),
    step(/from user_companion_blocks b[\s\S]+b\.companion_id = \$2::uuid/i, { rows: [] }),
    step(/from companions c[\s\S]+for share/i, {
      rows: [{ id: ids.companion, user_id: ids.otherUser }],
    }),
    step(/insert into user_companion_blocks[\s\S]+on conflict \(user_id, companion_id\) do nothing/i, {
      rows: [],
    }),
    step(/from user_companion_blocks b[\s\S]+b\.companion_id = \$2::uuid/i, { rows: [first] }),
    step(/^commit$/i),
  ]);
  const blocked = await blockCompanionForConsumer(putClient, {
    blockId: ids.block,
    userId: ids.user,
    companionId: ids.companion,
  });
  assert.equal(blocked.companionId, ids.companion);
  assertPublicDto(blocked);
  putClient.assertDone();

  const replayClient = scriptedClient([
    step(/^begin$/i),
    step(/from user_companion_blocks b[\s\S]+b\.companion_id = \$2::uuid/i, { rows: [first] }),
    step(/^commit$/i),
  ]);
  assert.deepEqual(
    await blockCompanionForConsumer(replayClient, {
      userId: ids.user,
      companionId: ids.companion,
    }),
    blocked,
  );
  replayClient.assertDone();

  const selfClient = scriptedClient([
    step(/^begin$/i),
    step(/from user_companion_blocks b[\s\S]+b\.companion_id = \$2::uuid/i, { rows: [] }),
    step(/from companions c[\s\S]+for share/i, {
      rows: [{ id: ids.companion, user_id: ids.user }],
    }),
    step(/^rollback$/i),
  ]);
  await expectGatewayError(
    () => blockCompanionForConsumer(selfClient, {
      userId: ids.user,
      companionId: ids.companion,
    }),
    'COMPANION_BLOCK_TARGET_NOT_FOUND',
    404,
  );
  selfClient.assertDone();

  const deleteClient = scriptedClient([
    step(/delete from user_companion_blocks[\s\S]+user_id = \$1::uuid[\s\S]+companion_id = \$2::uuid/i, {
      rows: [],
    }),
  ]);
  assert.deepEqual(
    await unblockCompanionForConsumer(deleteClient, {
      userId: ids.user,
      companionId: ids.companion,
    }),
    { companionId: ids.companion, blocked: false, blockedAt: null },
  );
  deleteClient.assertDone();
}

async function checkStableFailuresAndStaticSafety() {
  const failing = {
    async query() {
      throw new Error('database failure SENSITIVE_SENTINEL');
    },
  };
  const error = await expectGatewayError(
    () => listUserRequestsForConsumer(failing, { userId: ids.user }),
    'COMPLIANCE_STORE_UNAVAILABLE',
    503,
  );
  assert.equal(error.message, 'Store Lite compliance data is temporarily unavailable');
  assert.equal(error.message.includes('SENSITIVE_SENTINEL'), false);

  await expectGatewayError(
    () => listUserRequestsForConsumer(noQueryClient(), { userId: ids.user, status: 'paid' }),
    'USER_REQUEST_QUERY_INVALID',
    400,
  );
  await expectGatewayError(
    () => createUserRequestForConsumer(noQueryClient(), {
      ...requestInput,
      requestType: 'data_copy',
      supportCategory: 'booking',
    }),
    'USER_REQUEST_INVALID',
    400,
  );
  await expectGatewayError(
    () => createContentReportForConsumer(noQueryClient(), {
      ...reportInput,
      category: 'payment_refund',
    }),
    'CONTENT_REPORT_INVALID',
    400,
  );
  for (const limit of [0, 51, 1.5, '01', 'bad']) {
    await expectGatewayError(
      () => listContentReportsForConsumer(noQueryClient(), { userId: ids.user, limit }),
      'CONTENT_REPORT_QUERY_INVALID',
      400,
    );
  }
  await assert.rejects(
    () => createUserRequestForConsumer(null, requestInput),
    /PostgreSQL client/,
  );

  const source = await readFile(new URL('../store/postgresStoreLiteCompliance.mjs', import.meta.url), 'utf8');
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /on conflict do nothing[\s\S]+findActiveAccountDeletion/i);
  assert.match(source, /report_context = 'store_lite_content'/i);
  assert.match(source, /on conflict \(reporter_id, client_request_id\)[\s\S]+where report_context = 'store_lite_content'/i);
  assert.match(source, /for update/i);
  assert.match(source, /insert into admin_action_logs/i);
  assert.match(source, /to_char\([\s\S]+SS\.US/i);
  assert.doesNotMatch(source, /select[\s\S]{0,200}\b(phone|request_fingerprint|reported_user_id|evidence_files|handled_by)\b[\s\S]{0,80}from user_requests r/i);
  assert.doesNotMatch(source, /payments|refunds|wallets|merchant_offerings/i);
}

function userRequestAdminTransitionClient(before, after, targetStatus) {
  return scriptedClient([
    step(/^begin$/i),
    step(/select r\.\*[\s\S]+for update/i, { rows: [before] }),
    step(new RegExp(`update user_requests[\\s\\S]+${targetStatus}_at = now\\(\\)[\\s\\S]+status = \\$2::user_request_status`, 'i'), {
      rows: [after],
    }, (params) => {
      assert.deepEqual(params, [ids.request, before.status, targetStatus]);
    }),
    step(/insert into user_request_status_logs/i, { rows: [] }, (params) => {
      assert.equal(params[4], 'admin');
      assert.equal(params[5], null);
      assert.equal(params[6], ids.admin);
    }),
    step(/insert into admin_action_logs/i, { rows: [] }),
    step(/from user_requests r[\s\S]+where r\.id = \$1::uuid[\s\S]+limit 1/i, { rows: [after] }),
    step(/from user_request_status_logs/i, {
      rows: [userRequestStatusLog(before.status, targetStatus, 'admin')],
    }),
    step(/^commit$/i),
  ]);
}

function reportAdminTransitionClient(before, after, targetStatus, resolutionAction = null) {
  const steps = [
    step(/^begin$/i),
    step(/select r\.id, r\.status, r\.target_type, r\.target_id[\s\S]+for update/i, {
      rows: [{
        id: before.id,
        status: before.status,
        target_type: before.target_type,
        target_id: before.target_id,
      }],
    }),
  ];
  if (resolutionAction === 'remove_post') {
    steps.push(step(/update posts[\s\S]+is_feed_visible = false/i, { rows: [{ id: before.target_id }] }));
  }
  if (resolutionAction === 'suspend_companion') {
    steps.push(step(/update companions[\s\S]+service_enabled = false/i, { rows: [{ id: before.target_id }] }));
  }
  steps.push(
    step(/update reports[\s\S]+status = \$3::report_status[\s\S]+status = \$2::report_status/i, {
      rows: [{ id: ids.report }],
    }, (params) => {
      assert.equal(params[0], ids.report);
      assert.equal(params[1], before.status);
      assert.equal(params[2], targetStatus);
      assert.equal(params[3], ids.admin);
      if (targetStatus === 'investigating') {
        assert.equal(params[4], null);
      } else {
        const publicResult = JSON.parse(params[4]);
        assert.equal(publicResult.resolutionAction, resolutionAction || 'no_action');
        assert.equal(typeof publicResult.publicMessage, 'string');
      }
    }),
    step(/insert into admin_action_logs/i, { rows: [] }),
    step(/join users reporter[\s\S]+where r\.id = \$1::uuid/i, { rows: [after] }),
    step(/^commit$/i),
  );
  return scriptedClient(steps);
}

function assertAdminAuditBeforeCommit(client, action) {
  const auditIndex = client.calls.findIndex((call) => /insert into admin_action_logs/i.test(call.sql));
  const commitIndex = client.calls.findIndex((call) => /^commit$/i.test(call.sql));
  assert.ok(auditIndex > 0 && commitIndex > auditIndex);
  assert.equal(client.calls[auditIndex].params[1], ids.admin);
  assert.equal(client.calls[auditIndex].params[2], action);
  assert.equal(client.calls[auditIndex].params[4], action.startsWith('user_request') ? ids.request : ids.report);
}

function adminUserRequestInput() {
  return {
    adminId: ids.admin,
    userRequestId: ids.request,
    statusLogId: ids.log,
    adminActionLogId: ids.action,
    publicMessage: '平台正在处理你的请求。',
    internalNote: '仅运营可见',
    ip: '127.0.0.1',
    userAgent: 'gateway-check',
  };
}

function adminReportInput() {
  return {
    adminId: ids.admin,
    reportId: ids.report,
    adminActionLogId: ids.action,
    internalNote: '仅运营可见',
    ip: '127.0.0.1',
    userAgent: 'gateway-check',
  };
}

function userRequestRow(overrides = {}) {
  return {
    id: ids.request,
    user_id: ids.user,
    request_type: 'support',
    support_category: 'booking',
    booking_request_id: ids.booking,
    description: requestInput.description,
    status: 'submitted',
    processing_at: null,
    completed_at: null,
    declined_at: null,
    cancelled_at: null,
    created_at: '2026-08-23T10:00:00.000Z',
    created_at_cursor: '2026-08-23T10:00:00.000900Z',
    updated_at: '2026-08-23T10:00:00.000Z',
    consumer_name: '测试用户',
    ...overrides,
  };
}

function userRequestStatusLog(fromStatus, toStatus, actorType) {
  return {
    id: ids.log,
    from_status: fromStatus,
    to_status: toStatus,
    actor_type: actorType,
    reason_code: toStatus === 'submitted' ? 'user_submitted' : 'status_changed',
    public_message: toStatus === 'submitted' ? null : '状态已更新。',
    created_at: '2026-08-23T10:00:00.000Z',
  };
}

function contentReportRow(overrides = {}) {
  return {
    id: ids.report,
    target_type: 'post',
    target_id: ids.post,
    category: 'content_violation',
    description: reportInput.description,
    status: 'pending',
    result: null,
    handled_by: null,
    handled_at: null,
    created_at: '2026-08-23T10:00:00.000Z',
    created_at_cursor: '2026-08-23T10:00:00.000900Z',
    updated_at: '2026-08-23T10:00:00.000Z',
    target_display_name: '示例作品说明',
    target_image_url: 'https://cdn.example/post-cover.jpg',
    reporter_id: ids.user,
    reporter_name: '测试用户',
    ...overrides,
  };
}

function blockRow(overrides = {}) {
  return {
    id: ids.block,
    companion_id: ids.companion,
    created_at: '2026-08-23T10:00:00.000Z',
    created_at_cursor: '2026-08-23T10:00:00.000900Z',
    display_name: '林摄影师',
    real_photo_url: 'https://cdn.example/portrait.jpg',
    base_city: '上海',
    ...overrides,
  };
}

function assertPublicDto(value) {
  const json = JSON.stringify(value);
  assert.doesNotMatch(json, /phone|internalNote|fingerprint|adminId|reportedUserId|evidenceFiles/i);
}

function assertAdminDto(value) {
  const json = JSON.stringify(value);
  assert.doesNotMatch(json, /phone|internalNote|fingerprint|reportedUserId|evidenceFiles/i);
}

function scriptedClient(steps) {
  const queue = [...steps];
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      const expected = queue.shift();
      assert.ok(expected, `Unexpected SQL: ${normalized}`);
      assert.match(normalized, expected.pattern);
      expected.check?.(params, normalized);
      if (expected.error) throw expected.error;
      return expected.result;
    },
    assertDone() {
      assert.equal(queue.length, 0, `${queue.length} expected SQL statement(s) were not executed`);
    },
  };
}

function step(pattern, result = { rows: [] }, check) {
  return { pattern, result, check };
}

function noQueryClient() {
  return {
    async query(sql) {
      assert.fail(`Validation should happen before SQL: ${sql}`);
    },
  };
}

async function expectGatewayError(operation, code, status) {
  try {
    await operation();
    assert.fail(`Expected ${code}`);
  } catch (error) {
    assert.ok(error instanceof StoreLiteComplianceGatewayError, `Expected StoreLiteComplianceGatewayError, got ${error}`);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return error;
  }
}
