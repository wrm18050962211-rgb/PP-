import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BookingRequestGatewayError,
  cancelBookingRequestForAdmin,
  cancelBookingRequestForConsumer,
  confirmBookingRequestForAdmin,
  createBookingRequestForConsumer,
  declineBookingRequestForAdmin,
  getBookingRequestDetailForAdmin,
  getBookingRequestDetailForConsumer,
  listBookingRequestsForAdmin,
  listBookingRequestsForConsumer,
} from '../store/postgresBookingRequests.mjs';

const ids = Object.freeze({
  user: '11111111-1111-4111-8111-111111111111',
  otherUser: '11111111-1111-4111-8111-111111111112',
  companion: '22222222-2222-4222-8222-222222222222',
  booking: '33333333-3333-4333-8333-333333333333',
  booking2: '33333333-3333-4333-8333-333333333334',
  log: '44444444-4444-4444-8444-444444444444',
  admin: '55555555-5555-4555-8555-555555555555',
  otherAdmin: '55555555-5555-4555-8555-555555555556',
  action: '66666666-6666-4666-8666-666666666666',
});

const createInput = Object.freeze({
  bookingRequestId: ids.booking,
  statusLogId: ids.log,
  userId: ids.user,
  companionId: ids.companion,
  clientRequestId: 'client-request-0001',
  requestedStartAt: '2026-09-01T06:00:00+08:00',
  requestedEndAt: '2026-09-01T08:00:00+08:00',
  timezone: 'Asia/Shanghai',
  city: '上海',
  addressText: '徐汇区示例集合点',
  requirements: '双人城市街拍，希望自然纪实。',
});

let capturedFingerprint = '';
await checkCreateAndReplay();
await checkCreateConflictAndUnavailable();
await checkConsumerReadsAndCursor();
await checkConsumerCancel();
await checkAdminReads();
await checkAdminTransitions();
await checkStableFailuresAndValidation();
await checkStaticSafetyContract();

console.log('PostgreSQL Store Lite booking gateway checks passed.');

async function checkCreateAndReplay() {
  const createdRow = bookingRow();
  const client = scriptedClient([
    step(/^begin$/i),
    step(/select id, request_fingerprint[\s\S]+client_request_id = \$2/i, { rows: [] }, (params) => {
      assert.deepEqual(params, [ids.user, createInput.clientRequestId]);
    }),
    step(/from companions c[\s\S]+service_enabled = true/i, { rows: [{ id: ids.companion }] }),
    step(/insert into booking_requests/i, { rows: [{ id: ids.booking }] }, (params) => {
      assert.equal(params[0], ids.booking);
      assert.equal(params[1], ids.user);
      assert.equal(params[2], ids.companion);
      assert.equal(params[3], createInput.clientRequestId);
      assert.match(params[4], /^[a-f0-9]{64}$/);
      capturedFingerprint = params[4];
      assert.equal(params[5], '2026-08-31T22:00:00.000Z');
      assert.equal(params[6], '2026-09-01T00:00:00.000Z');
    }),
    step(/insert into booking_request_status_logs/i, { rows: [] }, (params) => {
      assert.deepEqual(params.slice(0, 7), [ids.log, ids.booking, null, 'submitted', 'user', ids.user, null]);
    }),
    step(/from booking_requests b[\s\S]+b\.user_id = \$2::uuid/i, { rows: [createdRow] }),
    step(/from booking_request_status_logs/i, { rows: [statusLog(null, 'submitted', 'user')] }),
    step(/^commit$/i),
  ]);

  const created = await createBookingRequestForConsumer(client, createInput);
  assert.equal(created.id, ids.booking);
  assert.equal(created.status, 'submitted');
  assert.equal(created.requestedSchedule.startAt, '2026-08-31T22:00:00.000Z');
  assert.equal(created.requirements, createInput.requirements);
  assertPublicConsumerDto(created);
  client.assertDone();

  const replayClient = scriptedClient([
    step(/^begin$/i),
    step(/select id, request_fingerprint/i, { rows: [{ id: ids.booking, request_fingerprint: capturedFingerprint }] }),
    step(/from booking_requests b[\s\S]+b\.user_id = \$2::uuid/i, { rows: [createdRow] }),
    step(/from booking_request_status_logs/i, { rows: [statusLog(null, 'submitted', 'user')] }),
    step(/^commit$/i),
  ]);
  const replayed = await createBookingRequestForConsumer(replayClient, createInput);
  assert.deepEqual(replayed, created, 'same payload replay must return the same public resource');
  assert.equal(
    replayClient.calls.some((call) => /from companions c|insert into booking_requests/i.test(call.sql)),
    false,
    'replay must not depend on current photographer availability or insert a second row',
  );
  replayClient.assertDone();
}

async function checkCreateConflictAndUnavailable() {
  const conflictClient = scriptedClient([
    step(/^begin$/i),
    step(/select id, request_fingerprint/i, { rows: [{ id: ids.booking, request_fingerprint: '0'.repeat(64) }] }),
    step(/^rollback$/i),
  ]);
  await expectGatewayError(
    () => createBookingRequestForConsumer(conflictClient, createInput),
    'BOOKING_IDEMPOTENCY_CONFLICT',
    409,
  );
  conflictClient.assertDone();

  const unavailableClient = scriptedClient([
    step(/^begin$/i),
    step(/select id, request_fingerprint/i, { rows: [] }),
    step(/from companions c/i, { rows: [] }),
    step(/^rollback$/i),
  ]);
  await expectGatewayError(
    () => createBookingRequestForConsumer(unavailableClient, { ...createInput, clientRequestId: 'client-request-0002' }),
    'BOOKING_TARGET_UNAVAILABLE',
    404,
  );
  unavailableClient.assertDone();
}

async function checkConsumerReadsAndCursor() {
  const first = bookingRow({
    id: ids.booking,
    created_at_cursor: '2026-08-23T10:00:00.000900Z',
    created_at: '2026-08-23T10:00:00.000Z',
  });
  const second = bookingRow({
    id: ids.booking2,
    created_at_cursor: '2026-08-23T10:00:00.000100Z',
    created_at: '2026-08-23T10:00:00.000Z',
  });
  const firstPageClient = scriptedClient([
    step(/b\.user_id = \$1::uuid[\s\S]+limit \$5/i, { rows: [first, second] }, (params) => {
      assert.deepEqual(params, [ids.user, null, null, null, 2]);
    }),
  ]);
  const firstPage = await listBookingRequestsForConsumer(firstPageClient, { userId: ids.user, limit: 1 });
  assert.equal(firstPage.items.length, 1);
  assert.equal(firstPage.hasMore, true);
  assert.ok(firstPage.nextCursor);
  assertPublicConsumerDto(firstPage.items[0]);
  assert.doesNotMatch(firstPageClient.calls[0].sql, /consumer_phone|companion_phone|companion_user/i);
  firstPageClient.assertDone();

  const nextPageClient = scriptedClient([
    step(/\(b\.created_at, b\.id\) < \(\$3::timestamptz, \$4::uuid\)/i, { rows: [] }, (params) => {
      assert.equal(params[0], ids.user);
      assert.equal(params[2], '2026-08-23T10:00:00.000900Z');
      assert.equal(params[3], ids.booking);
    }),
  ]);
  const nextPage = await listBookingRequestsForConsumer(nextPageClient, {
    userId: ids.user,
    limit: 1,
    cursor: firstPage.nextCursor,
  });
  assert.deepEqual(nextPage, { items: [], nextCursor: null, hasMore: false });
  nextPageClient.assertDone();

  await expectGatewayError(
    () => listBookingRequestsForConsumer(noQueryClient(), { userId: ids.otherUser, cursor: firstPage.nextCursor }),
    'BOOKING_CURSOR_INVALID',
    400,
  );
  await expectGatewayError(
    () =>
      listBookingRequestsForConsumer(noQueryClient(), {
        userId: ids.user,
        status: 'submitted',
        cursor: firstPage.nextCursor,
      }),
    'BOOKING_CURSOR_INVALID',
    400,
  );

  const detailClient = scriptedClient([
    step(/where b\.id = \$1::uuid[\s\S]+b\.user_id = \$2::uuid/i, { rows: [first] }, (params) => {
      assert.deepEqual(params, [ids.booking, ids.user]);
    }),
    step(/from booking_request_status_logs/i, { rows: [statusLog(null, 'submitted', 'user')] }),
  ]);
  const detail = await getBookingRequestDetailForConsumer(detailClient, {
    userId: ids.user,
    bookingRequestId: ids.booking,
  });
  assertPublicConsumerDto(detail);
  assert.doesNotMatch(detailClient.calls[0].sql, /consumer_phone|companion_phone|companion_user/i);
  assert.deepEqual(Object.keys(detail.statusLogs[0]).sort(), ['createdAt', 'fromStatus', 'id', 'message', 'toStatus']);
  detailClient.assertDone();

  const forbiddenClient = scriptedClient([
    step(/b\.user_id = \$2::uuid/i, { rows: [] }),
  ]);
  await expectGatewayError(
    () => getBookingRequestDetailForConsumer(forbiddenClient, { userId: ids.user, bookingRequestId: ids.booking2 }),
    'BOOKING_REQUEST_NOT_FOUND',
    404,
  );
  forbiddenClient.assertDone();
}

async function checkConsumerCancel() {
  const before = bookingRow({ status: 'submitted' });
  const after = bookingRow({ status: 'cancelled', cancelled_at: '2026-08-23T11:00:00.000Z' });
  const client = scriptedClient([
    step(/^begin$/i),
    step(/select b\.\*[\s\S]+b\.user_id = \$2::uuid[\s\S]+for update/i, { rows: [before] }),
    step(/update booking_requests[\s\S]+status = \$3::booking_request_status[\s\S]+status = \$2::booking_request_status/i, { rows: [after] }, (params) => {
      assert.deepEqual(params, [ids.booking, 'submitted', 'cancelled']);
    }),
    step(/insert into booking_request_status_logs/i, { rows: [] }, (params) => {
      assert.equal(params[2], 'submitted');
      assert.equal(params[3], 'cancelled');
      assert.equal(params[4], 'user');
      assert.equal(params[5], ids.user);
      assert.equal(params[6], null);
    }),
    step(/b\.user_id = \$2::uuid/i, { rows: [after] }),
    step(/from booking_request_status_logs/i, { rows: [statusLog('submitted', 'cancelled', 'user')] }),
    step(/^commit$/i),
  ]);
  const result = await cancelBookingRequestForConsumer(client, {
    userId: ids.user,
    bookingRequestId: ids.booking,
    statusLogId: ids.log,
    reasonCode: 'plans_changed',
    reason: '行程变化',
  });
  assert.equal(result.status, 'cancelled');
  assertPublicConsumerDto(result);
  assert.equal(client.calls.some((call) => /admin_action_logs/i.test(call.sql)), false);
  client.assertDone();
}

async function checkAdminReads() {
  const row = bookingRow({ consumer_phone: '13812345678', companion_phone: '13987654321' });
  const listClient = scriptedClient([
    step(/u\.phone as consumer_phone[\s\S]+limit \$4/i, { rows: [row] }, (params) => {
      assert.deepEqual(params, [null, null, null, 21]);
    }),
  ]);
  const list = await listBookingRequestsForAdmin(listClient, { adminId: ids.admin });
  assert.equal(list.items[0].consumer.phoneMasked, '138****5678');
  assert.equal(list.items[0].companionPhoneMasked, '139****4321');
  assert.equal(JSON.stringify(list).includes('13812345678'), false, 'admin list must not expose full phone');
  assert.equal(JSON.stringify(list).includes('13987654321'), false, 'admin list must mask photographer phone');
  assert.equal(Object.hasOwn(list.items[0].consumer, 'phone'), false);
  listClient.assertDone();

  const cursorClient = scriptedClient([
    step(/u\.phone as consumer_phone[\s\S]+limit \$4/i, {
      rows: [
        row,
        bookingRow({
          id: ids.booking2,
          created_at_cursor: '2026-08-23T09:59:59.999900Z',
          consumer_phone: '13812345678',
          companion_phone: '13987654321',
        }),
      ],
    }),
  ]);
  const cursorPage = await listBookingRequestsForAdmin(cursorClient, { adminId: ids.admin, limit: 1 });
  assert.ok(cursorPage.nextCursor);
  await expectGatewayError(
    () => listBookingRequestsForAdmin(noQueryClient(), { adminId: ids.otherAdmin, cursor: cursorPage.nextCursor }),
    'BOOKING_CURSOR_INVALID',
    400,
  );
  cursorClient.assertDone();

  const detailClient = scriptedClient([
    step(/u\.phone as consumer_phone[\s\S]+where b\.id = \$1::uuid/i, { rows: [row] }),
    step(/from booking_request_status_logs/i, { rows: [statusLog(null, 'submitted', 'user')] }),
  ]);
  const detail = await getBookingRequestDetailForAdmin(detailClient, {
    adminId: ids.admin,
    bookingRequestId: ids.booking,
  });
  assert.equal(detail.consumer.phone, '13812345678');
  assert.equal(detail.companionPhone, '13987654321');
  assert.equal(detail.statusLogs[0].actorType, 'user');
  assert.equal(Object.hasOwn(detail.statusLogs[0], 'actorUserId'), false);
  assert.equal(Object.hasOwn(detail.statusLogs[0], 'actorAdminId'), false);
  detailClient.assertDone();
}

async function checkAdminTransitions() {
  const submitted = bookingRow({ status: 'submitted', consumer_phone: '13812345678', companion_phone: '13987654321' });
  const confirmation = {
    confirmedStartAt: '2026-09-01T07:00:00+08:00',
    confirmedEndAt: '2026-09-01T09:00:00+08:00',
    confirmedCity: '上海',
    confirmedAddressText: '徐汇区确认集合点',
    arrivalInstructions: '请提前十分钟到达，向前台出示预约编号。',
    supportChannelKey: 'store_lite.support',
  };
  const confirmed = bookingRow({
    status: 'confirmed',
    confirmed_start_at: '2026-08-31T23:00:00.000Z',
    confirmed_end_at: '2026-09-01T01:00:00.000Z',
    confirmed_city: confirmation.confirmedCity,
    confirmed_address_text: confirmation.confirmedAddressText,
    arrival_instructions: confirmation.arrivalInstructions,
    support_channel_key: confirmation.supportChannelKey,
    confirmed_at: '2026-08-23T11:00:00.000Z',
    consumer_phone: '13812345678',
    companion_phone: '13987654321',
  });
  const confirmClient = adminTransitionClient(submitted, confirmed, 'confirmed');
  const result = await confirmBookingRequestForAdmin(confirmClient, {
    adminId: ids.admin,
    bookingRequestId: ids.booking,
    statusLogId: ids.log,
    adminActionLogId: ids.action,
    ...confirmation,
    publicMessage: '平台已为你确认预约。',
    internalNote: '已电话联系合作方。',
    ip: '127.0.0.1',
    userAgent: 'gateway-check',
  });
  assert.equal(result.status, 'confirmed');
  assert.equal(result.confirmation.supportChannel, confirmation.supportChannelKey);
  assertAdminTransitionAtomic(confirmClient, 'booking_request.confirmed');
  confirmClient.assertDone();

  const declined = bookingRow({
    status: 'declined',
    declined_at: '2026-08-23T11:00:00.000Z',
    consumer_phone: '13812345678',
    companion_phone: '13987654321',
  });
  const declineClient = adminTransitionClient(submitted, declined, 'declined');
  await declineBookingRequestForAdmin(declineClient, {
    adminId: ids.admin,
    bookingRequestId: ids.booking,
    statusLogId: ids.log,
    adminActionLogId: ids.action,
    reasonCode: 'schedule_unavailable',
    publicMessage: '该时段暂时无法安排。',
    internalNote: '运营备注',
  });
  assertAdminTransitionAtomic(declineClient, 'booking_request.declined');
  declineClient.assertDone();

  const cancelled = bookingRow({
    status: 'cancelled',
    cancelled_at: '2026-08-23T11:00:00.000Z',
    consumer_phone: '13812345678',
    companion_phone: '13987654321',
  });
  const cancelClient = adminTransitionClient(submitted, cancelled, 'cancelled');
  await cancelBookingRequestForAdmin(cancelClient, {
    adminId: ids.admin,
    bookingRequestId: ids.booking,
    statusLogId: ids.log,
    adminActionLogId: ids.action,
    reasonCode: 'operations_cancelled',
    publicMessage: '平台无法继续安排该预约。',
  });
  assertAdminTransitionAtomic(cancelClient, 'booking_request.cancelled');
  cancelClient.assertDone();

  const replayClient = scriptedClient([
    step(/^begin$/i),
    step(/for update/i, { rows: [confirmed] }),
    step(/u\.phone as consumer_phone[\s\S]+where b\.id = \$1::uuid/i, { rows: [confirmed] }),
    step(/from booking_request_status_logs/i, { rows: [statusLog('submitted', 'confirmed', 'admin')] }),
    step(/^commit$/i),
  ]);
  await confirmBookingRequestForAdmin(replayClient, {
    adminId: ids.admin,
    bookingRequestId: ids.booking,
    ...confirmation,
  });
  assert.equal(replayClient.calls.some((call) => /update booking_requests|insert into .*logs/i.test(call.sql)), false);
  replayClient.assertDone();

  const terminalClient = scriptedClient([
    step(/^begin$/i),
    step(/for update/i, { rows: [declined] }),
    step(/^rollback$/i),
  ]);
  await expectGatewayError(
    () => cancelBookingRequestForAdmin(terminalClient, {
      adminId: ids.admin,
      bookingRequestId: ids.booking,
      reasonCode: 'operations_cancelled',
      publicMessage: '取消',
    }),
    'BOOKING_STATUS_CONFLICT',
    409,
  );
  terminalClient.assertDone();
}

async function checkStableFailuresAndValidation() {
  const failing = {
    async query() {
      const error = new Error('password=secret host=internal');
      error.code = 'ECONNRESET';
      throw error;
    },
  };
  const error = await expectGatewayError(
    () => listBookingRequestsForConsumer(failing, { userId: ids.user }),
    'BOOKING_STORE_UNAVAILABLE',
    503,
  );
  assert.equal(error.message, 'Booking request data is temporarily unavailable');
  assert.equal(error.message.includes('secret'), false);

  await expectGatewayError(
    () => listBookingRequestsForConsumer(noQueryClient(), { userId: ids.user, status: 'paid' }),
    'BOOKING_STATUS_INVALID',
    400,
  );
  for (const limit of [0, 51, 1.5, '01', 'abc']) {
    await expectGatewayError(
      () => listBookingRequestsForConsumer(noQueryClient(), { userId: ids.user, limit }),
      'BOOKING_LIMIT_INVALID',
      400,
    );
  }
  await expectGatewayError(
    () => listBookingRequestsForConsumer(noQueryClient(), { userId: ids.user, cursor: 'not_base64!' }),
    'BOOKING_CURSOR_INVALID',
    400,
  );
  await expectGatewayError(
    () => listBookingRequestsForConsumer(noQueryClient(), { userId: ids.user, cursor: 'A' }),
    'BOOKING_CURSOR_INVALID',
    400,
  );
  await assert.rejects(
    () => createBookingRequestForConsumer(null, createInput),
    /PostgreSQL client/,
  );
}

async function checkStaticSafetyContract() {
  const source = await readFile(new URL('../store/postgresBookingRequests.mjs', import.meta.url), 'utf8');
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /on conflict \(user_id, client_request_id\) do nothing/i);
  assert.match(source, /for update/i);
  assert.match(source, /status = \$2::booking_request_status/i);
  assert.match(source, /insert into admin_action_logs/i);
  assert.match(source, /to_char\(b\.created_at[\s\S]+SS\.US/i);
  assert.doesNotMatch(source, /ForPhotographer|ForCompanion/);
  assert.doesNotMatch(source, /payments|refunds|wallets|merchant_offerings/i);
}

function adminTransitionClient(before, after, targetStatus) {
  return scriptedClient([
    step(/^begin$/i),
    step(/select b\.\*[\s\S]+for update/i, { rows: [before] }, (params) => {
      assert.deepEqual(params, [ids.booking]);
    }),
    step(/update booking_requests/i, { rows: [after] }, (params, sql) => {
      assert.match(sql, /and status = \$2::booking_request_status/i);
      assert.equal(params[0], ids.booking);
      assert.equal(params[1], 'submitted');
      if (targetStatus !== 'confirmed') assert.equal(params[2], targetStatus);
    }),
    step(/insert into booking_request_status_logs/i, { rows: [] }, (params) => {
      assert.equal(params[2], 'submitted');
      assert.equal(params[3], targetStatus);
      assert.equal(params[4], 'admin');
      assert.equal(params[5], null);
      assert.equal(params[6], ids.admin);
    }),
    step(/insert into admin_action_logs/i, { rows: [] }),
    step(/u\.phone as consumer_phone[\s\S]+where b\.id = \$1::uuid/i, { rows: [after] }),
    step(/from booking_request_status_logs/i, { rows: [statusLog('submitted', targetStatus, 'admin')] }),
    step(/^commit$/i),
  ]);
}

function assertAdminTransitionAtomic(client, expectedAction) {
  const actionIndex = client.calls.findIndex((call) => /insert into admin_action_logs/i.test(call.sql));
  const statusLogIndex = client.calls.findIndex((call) => /insert into booking_request_status_logs/i.test(call.sql));
  const commitIndex = client.calls.findIndex((call) => /^commit$/i.test(call.sql));
  assert.ok(statusLogIndex > 0 && actionIndex > statusLogIndex && commitIndex > actionIndex);
  const actionCall = client.calls[actionIndex];
  assert.equal(actionCall.params[1], ids.admin);
  assert.equal(actionCall.params[2], expectedAction);
  assert.equal(actionCall.params[3], ids.booking);
}

function assertPublicConsumerDto(value) {
  const json = JSON.stringify(value);
  assert.doesNotMatch(json, /phone|admin|internal|fingerprint|amount|price|payment|refund|finance/i);
}

function bookingRow(overrides = {}) {
  return {
    id: ids.booking,
    user_id: ids.user,
    companion_id: ids.companion,
    requested_start_at: '2026-08-31T22:00:00.000Z',
    requested_end_at: '2026-09-01T00:00:00.000Z',
    timezone: 'Asia/Shanghai',
    city: '上海',
    address_text: '徐汇区示例集合点',
    requirements: createInput.requirements,
    status: 'submitted',
    confirmed_start_at: null,
    confirmed_end_at: null,
    confirmed_city: null,
    confirmed_address_text: null,
    arrival_instructions: null,
    support_channel_key: null,
    confirmed_at: null,
    declined_at: null,
    cancelled_at: null,
    created_at: '2026-08-23T10:00:00.000Z',
    created_at_cursor: '2026-08-23T10:00:00.000900Z',
    updated_at: '2026-08-23T10:00:00.000Z',
    companion_name: '林摄影师',
    companion_avatar_url: 'https://cdn.example/portrait.jpg',
    consumer_name: '预约用户',
    consumer_phone: undefined,
    companion_phone: undefined,
    ...overrides,
  };
}

function statusLog(fromStatus, toStatus, actorType) {
  return {
    id: ids.log,
    from_status: fromStatus,
    to_status: toStatus,
    actor_type: actorType,
    reason_code: `${toStatus}_reason`,
    reason: toStatus === 'submitted' ? null : `${toStatus} public message`,
    created_at: '2026-08-23T10:00:00.000Z',
  };
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
    assert.ok(error instanceof BookingRequestGatewayError, `Expected BookingRequestGatewayError, got ${error}`);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return error;
  }
}
