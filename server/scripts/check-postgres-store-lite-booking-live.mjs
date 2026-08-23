import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';

import { createPostgresStore } from '../store/postgresStore.mjs';
import { hashSessionToken } from '../store/sessionTokenHash.mjs';

const { Client, Pool } = pg;

const REQUIRED_DATABASE_NAME = 'pp_platform_store_lite_ci';
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const REQUIRED_TABLES = [
  'users',
  'companions',
  'admin_users',
  'user_sessions',
  'booking_requests',
  'booking_request_status_logs',
  'admin_action_logs',
];
const PAGINATION_BOOKING_COUNT = 112;
const PAGE_LIMIT = 17;
const FORBIDDEN_CONSUMER_KEYS = new Set([
  'phone',
  'phonemasked',
  'companionphone',
  'companionphonemasked',
  'requestfingerprint',
  'fingerprint',
  'internalnote',
  'adminid',
  'actoradminid',
  'actoruserid',
  'actortype',
  'operatorid',
  'operatortype',
  'reasoncode',
  'amount',
  'amountcents',
  'price',
  'pricecents',
  'payment',
  'refund',
  'platformfee',
  'settlement',
]);

class SafetyRefusalError extends Error {}

try {
  await runStoreLiteBookingAudit();
} catch (error) {
  const rawUrl = String(process.env.STORE_LITE_TEST_DATABASE_URL || '').trim();
  console.error(
    JSON.stringify(
      {
        ok: false,
        skipped: error instanceof SafetyRefusalError,
        reason: sanitizeError(error, rawUrl),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}

async function runStoreLiteBookingAudit() {
  const connectionConfig = readConnectionConfig(process.env);
  const fixture = buildFixture();
  const control = new Client({
    ...connectionConfig,
    application_name: 'still-store-lite-booking-live-control',
    connectionTimeoutMillis: 5000,
    query_timeout: 30000,
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 30000,
  });
  const checks = [];
  const bookingQueryTrace = [];
  let pool = null;
  let connected = false;
  let fixturesInserted = false;
  let auditError = null;
  let cleanupError = null;

  try {
    await control.connect();
    connected = true;
    await assertDatabaseSafety(control);
    await assertRequiredTables(control);
    checks.push('isolated-local-database', 'postgresql-16', 'public-canonical-schema');

    await insertFixture(control, fixture);
    fixturesInserted = true;
    checks.push('committed-random-uuid-fixtures', 'two-consumers', 'two-photographers', 'two-admins');

    pool = new Pool({
      ...connectionConfig,
      application_name: 'still-store-lite-booking-live-store',
      connectionTimeoutMillis: 5000,
      query_timeout: 30000,
      statement_timeout: 30000,
      idle_in_transaction_session_timeout: 30000,
      max: 6,
    });
    const store = createPostgresStore({
      databaseUrl: 'postgresql://store-lite-live-audit/pp_platform_store_lite_ci',
      poolFactory: () => tracedPool(pool, bookingQueryTrace),
      featureFlags: { storeLiteBookingsEnabled: true },
    });
    assert(store.capabilities.bookingRequests === true, 'Store Lite booking capability must be enabled');
    assert(store.bookingRequests, 'Store Lite booking gateway must be exposed when enabled');

    const sessions = await recoverSessions(store, fixture);
    checks.push('real-consumer-sessions', 'dual-device-session-recovery', 'protected-admin-sessions');

    await assertCreateIdempotencyAndIsolation(store, sessions, fixture);
    checks.push('same-payload-replay', 'different-payload-conflict', 'cross-user-isolation');

    await assertPagination(control, store, sessions, fixture, bookingQueryTrace);
    checks.push('over-100-keyset-pagination', 'microsecond-cursor-preservation', 'cross-device-read-recovery');

    await assertAdminContactBoundary(store, sessions, fixture);
    checks.push('consumer-dto-redaction', 'admin-list-phone-masking', 'admin-detail-protected-phones');

    await assertConfirmCancelFlow(control, store, sessions, fixture);
    checks.push('confirm-then-cancel', 'idempotent-cancel', 'legal-status-log-sequence');

    await assertConcurrentConfirm(control, store, sessions, fixture);
    checks.push('concurrent-double-confirm', 'single-transition-log', 'single-admin-audit');

    await assertAdminAuditRollback(control, store, sessions, fixture);
    checks.push('admin-audit-atomic-rollback', 'no-partial-status-transition');
  } catch (error) {
    auditError = error;
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch (error) {
        cleanupError = error;
      }
    }
    if (connected && fixturesInserted) {
      try {
        await cleanupFixture(control, fixture);
        await assertFixtureAbsent(control, fixture);
        fixturesInserted = false;
        checks.push('exact-row-cleanup', 'fixture-absence-verified');
      } catch (error) {
        cleanupError ||= error;
      }
    }
    if (connected) {
      try {
        await control.end();
      } catch (error) {
        cleanupError ||= error;
      }
    }
  }

  if (auditError) {
    if (cleanupError) {
      auditError.message = `${auditError.message}; cleanup failure: ${databaseErrorSummary(cleanupError)}`;
    }
    throw auditError;
  }
  if (cleanupError) throw cleanupError;

  console.log(
    JSON.stringify(
      {
        ok: true,
        database: REQUIRED_DATABASE_NAME,
        postgresMajor: 16,
        paginationBookingCount: PAGINATION_BOOKING_COUNT,
        checks,
      },
      null,
      2,
    ),
  );
}

function readConnectionConfig(env) {
  if (env.ALLOW_STORE_LITE_LIVE_TEST !== '1') {
    throw new SafetyRefusalError('ALLOW_STORE_LITE_LIVE_TEST=1 is required; Store Lite live audit was not run');
  }

  const rawUrl = String(env.STORE_LITE_TEST_DATABASE_URL || '').trim();
  if (!rawUrl) {
    throw new SafetyRefusalError(
      'STORE_LITE_TEST_DATABASE_URL is required; the application DATABASE_URL is intentionally ignored',
    );
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SafetyRefusalError('STORE_LITE_TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new SafetyRefusalError('STORE_LITE_TEST_DATABASE_URL must use the postgres or postgresql protocol');
  }
  if (parsed.search || parsed.hash) {
    throw new SafetyRefusalError('STORE_LITE_TEST_DATABASE_URL must not include query parameters or a fragment');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    throw new SafetyRefusalError('Store Lite live audit only accepts localhost, 127.0.0.1, or ::1');
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (database !== REQUIRED_DATABASE_NAME) {
    throw new SafetyRefusalError(`Store Lite live audit only accepts database ${REQUIRED_DATABASE_NAME}`);
  }
  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new SafetyRefusalError('STORE_LITE_TEST_DATABASE_URL contains an invalid port');
  }

  return {
    host,
    port,
    database,
    user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
  };
}

async function assertDatabaseSafety(client) {
  const result = await client.query(
    `select current_database() as database_name,
            current_schema() as schema_name,
            current_setting('server_version_num')::integer as server_version_num`,
  );
  const row = result.rows?.[0] || {};
  assert(row.database_name === REQUIRED_DATABASE_NAME, 'connected database name changed after URL validation');
  assert(row.schema_name === 'public', 'Store Lite live audit requires the public schema');
  assert(
    row.server_version_num >= 160000 && row.server_version_num < 170000,
    'Store Lite live audit requires PostgreSQL 16.x',
  );
}

async function assertRequiredTables(client) {
  const result = await client.query(
    `select candidate.name,
            to_regclass(format('%I.%I', 'public', candidate.name))::text as relation_name
     from unnest($1::text[]) as candidate(name)
     order by candidate.name`,
    [REQUIRED_TABLES],
  );
  const missing = result.rows.filter((row) => !row.relation_name).map((row) => row.name);
  assert(missing.length === 0, `required table(s) missing: ${missing.join(', ')}`);
}

function buildFixture() {
  const runId = randomUUID().replaceAll('-', '').slice(0, 12);
  const allocatedPhones = new Set();
  const users = {
    consumerA: fixtureUser(`SLB Consumer A ${runId}`, false, allocatedPhones),
    consumerB: fixtureUser(`SLB Consumer B ${runId}`, false, allocatedPhones),
    photographerOwnerA: fixtureUser(`SLB Photographer Owner A ${runId}`, true, allocatedPhones),
    photographerOwnerB: fixtureUser(`SLB Photographer Owner B ${runId}`, true, allocatedPhones),
  };
  const companions = {
    photographerA: fixtureCompanion(users.photographerOwnerA.id, `SLB Photographer A ${runId}`),
    photographerB: fixtureCompanion(users.photographerOwnerB.id, `SLB Photographer B ${runId}`),
  };
  const admins = {
    adminA: fixtureAdmin(`slb_ops_a_${runId}`),
    adminB: fixtureAdmin(`slb_ops_b_${runId}`),
  };
  const sessions = {
    consumerAFirst: fixtureSession({ userId: users.consumerA.id, role: 'consumer' }),
    consumerASecond: fixtureSession({ userId: users.consumerA.id, role: 'consumer' }),
    consumerB: fixtureSession({ userId: users.consumerB.id, role: 'consumer' }),
    photographerA: fixtureSession({
      userId: users.photographerOwnerA.id,
      companionId: companions.photographerA.id,
      role: 'consumer',
    }),
    photographerB: fixtureSession({
      userId: users.photographerOwnerB.id,
      companionId: companions.photographerB.id,
      role: 'consumer',
    }),
    adminA: fixtureSession({ adminId: admins.adminA.id, role: 'admin' }),
    adminB: fixtureSession({ adminId: admins.adminB.id, role: 'admin' }),
  };

  const paginationBookings = buildPaginationBookings(runId, users.consumerA.id, companions);
  const requests = {
    replayA: fixtureRequest(runId, 'replay-a', users.consumerA.id, companions.photographerA.id),
    replayB: fixtureRequest(runId, 'replay-b', users.consumerB.id, companions.photographerB.id),
    confirmCancel: fixtureRequest(runId, 'confirm-cancel', users.consumerA.id, companions.photographerA.id),
    concurrentConfirm: fixtureRequest(runId, 'concurrent-confirm', users.consumerA.id, companions.photographerB.id),
    atomicRollback: fixtureRequest(runId, 'atomic-rollback', users.consumerA.id, companions.photographerA.id),
  };
  requests.replayB.clientRequestId = requests.replayA.clientRequestId;

  const actions = {
    confirmCancel: randomUUID(),
    concurrentA: randomUUID(),
    concurrentB: randomUUID(),
    atomicStatusLog: randomUUID(),
  };
  const privateMarker = `internal-${runId}-${randomUUID()}`;
  const allBookingIds = [...paginationBookings.map((item) => item.id), ...Object.values(requests).map((item) => item.id)];

  return {
    runId,
    users,
    companions,
    admins,
    sessions,
    paginationBookings,
    requests,
    actions,
    privateMarker,
    allBookingIds,
  };
}

function fixtureUser(nickname, isCompanion, allocatedPhones) {
  let phone;
  do {
    phone = `13${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
  } while (allocatedPhones.has(phone));
  allocatedPhones.add(phone);
  return {
    id: randomUUID(),
    phone,
    nickname,
    isCompanion,
  };
}

function fixtureCompanion(userId, displayName) {
  return { id: randomUUID(), userId, displayName };
}

function fixtureAdmin(username) {
  return { id: randomUUID(), username, name: username, role: 'store_lite_ops' };
}

function fixtureSession({ userId = null, adminId = null, companionId = null, role }) {
  const token = `store-lite-live-${randomUUID()}-${randomUUID()}`;
  return {
    id: randomUUID(),
    token,
    tokenHash: hashSessionToken(token),
    sessionScope: adminId ? 'admin' : 'user',
    userId,
    adminId,
    companionId,
    role,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

function fixtureRequest(runId, suffix, userId, companionId) {
  return {
    id: randomUUID(),
    statusLogId: randomUUID(),
    userId,
    companionId,
    clientRequestId: `slb-${runId}-${suffix}`,
    requestedStartAt: '2035-03-01T02:00:00.000Z',
    requestedEndAt: '2035-03-01T04:00:00.000Z',
    timezone: 'Asia/Shanghai',
    city: '上海',
    addressText: `Store Lite live audit ${suffix}`,
    requirements: `Store Lite live audit request ${suffix}`,
  };
}

function buildPaginationBookings(runId, userId, companions) {
  const base = Date.parse('2034-01-01T00:00:00.000Z');
  const fractions = ['000900', '000100', '000800', '000200'];
  return Array.from({ length: PAGINATION_BOOKING_COUNT }, (_, index) => {
    const companionId = index % 2 === 0 ? companions.photographerA.id : companions.photographerB.id;
    return {
      id: randomUUID(),
      statusLogId: randomUUID(),
      userId,
      companionId,
      clientRequestId: `slb-${runId}-page-${String(index).padStart(3, '0')}`,
      requestFingerprint: `fixture-${runId}-${String(index).padStart(3, '0')}`,
      requestedStartAt: new Date(Date.parse('2035-04-01T00:00:00.000Z') + index * 3_600_000).toISOString(),
      requestedEndAt: new Date(Date.parse('2035-04-01T02:00:00.000Z') + index * 3_600_000).toISOString(),
      timezone: 'Asia/Shanghai',
      city: '上海',
      addressText: `Store Lite pagination address ${index}`,
      requirements: `Store Lite pagination requirement ${index}`,
      createdAt: microsecondTimestamp(base + Math.floor(index / 4) * 1000, fractions[index % fractions.length]),
    };
  });
}

function microsecondTimestamp(epochMilliseconds, fraction) {
  const iso = new Date(epochMilliseconds).toISOString();
  assert(iso.endsWith('.000Z'), 'microsecond fixture base must align to a whole second');
  assert(/^\d{6}$/.test(fraction), 'microsecond fixture fraction must contain six digits');
  return `${iso.slice(0, -5)}.${fraction}Z`;
}

async function insertFixture(client, fixture) {
  let began = false;
  try {
    await client.query('begin');
    began = true;
    await client.query(`set local statement_timeout = '30s'`);
    await client.query(`set local lock_timeout = '5s'`);

    await client.query(
      `insert into users (id, phone, nickname, city, status, is_companion, created_at, updated_at)
       select x.id::uuid, x.phone, x.nickname, '上海', 'active'::user_status,
              x.is_companion, now(), now()
       from jsonb_to_recordset($1::jsonb) as x(
         id text, phone text, nickname text, is_companion boolean
       )`,
      [JSON.stringify(Object.values(fixture.users).map(toDatabaseKeys))],
    );
    await client.query(
      `insert into companions (
         id, user_id, display_name, base_city, real_photo_url,
         status, service_enabled, created_at, updated_at
       )
       select x.id::uuid, x.user_id::uuid, x.display_name, '上海',
              'https://audit.invalid/photographer.jpg',
              'approved'::companion_status, true, now(), now()
       from jsonb_to_recordset($1::jsonb) as x(id text, user_id text, display_name text)`,
      [JSON.stringify(Object.values(fixture.companions).map(toDatabaseKeys))],
    );
    await client.query(
      `insert into admin_users (
         id, username, password_hash, name, role, status, created_at, updated_at
       )
       select x.id::uuid, x.username, 'unused-live-audit-hash', x.name,
              x.role, 'active', now(), now()
       from jsonb_to_recordset($1::jsonb) as x(
         id text, username text, name text, role text
       )`,
      [JSON.stringify(Object.values(fixture.admins).map(toDatabaseKeys))],
    );
    await client.query(
      `insert into user_sessions (
         id, token_hash, session_scope, user_id, admin_id, companion_id,
         role, provider, device_id, metadata, login_at, last_seen_at,
         expires_at, created_at, updated_at
       )
       select x.id::uuid, x.token_hash, x.session_scope,
              x.user_id::uuid, x.admin_id::uuid, x.companion_id::uuid,
              x.role, 'live-audit', x.id,
              case when x.admin_id is null then '{}'::jsonb
                   else '{"adminScope":["booking_requests:read","booking_requests:write"]}'::jsonb end,
              now(), now(), x.expires_at::timestamptz, now(), now()
       from jsonb_to_recordset($1::jsonb) as x(
         id text, token_hash text, session_scope text, user_id text,
         admin_id text, companion_id text, role text, expires_at text
       )`,
      [
        JSON.stringify(
          Object.values(fixture.sessions).map(({ token: _token, ...session }) => toDatabaseKeys(session)),
        ),
      ],
    );
    await insertPaginationBookings(client, fixture.paginationBookings);
    await client.query('commit');
    began = false;
  } catch (error) {
    if (began) {
      try {
        await client.query('rollback');
      } catch {
        // Preserve the insertion failure.
      }
    }
    throw error;
  }
}

async function insertPaginationBookings(client, bookings) {
  await client.query(
    `insert into booking_requests (
       id, user_id, companion_id, client_request_id, request_fingerprint,
       requested_start_at, requested_end_at, timezone, city, address_text,
       requirements, status, created_at, updated_at
     )
     select x.id::uuid, x.user_id::uuid, x.companion_id::uuid,
            x.client_request_id, x.request_fingerprint,
            x.requested_start_at::timestamptz, x.requested_end_at::timestamptz,
            x.timezone, x.city, x.address_text, x.requirements,
            'submitted'::booking_request_status,
            x.created_at::timestamptz, x.created_at::timestamptz
     from jsonb_to_recordset($1::jsonb) as x(
       id text, user_id text, companion_id text, client_request_id text,
       request_fingerprint text, requested_start_at text, requested_end_at text,
       timezone text, city text, address_text text, requirements text, created_at text
     )`,
    [JSON.stringify(bookings.map(toDatabaseKeys))],
  );
  await client.query(
    `insert into booking_request_status_logs (
       id, booking_request_id, from_status, to_status, actor_type,
       actor_user_id, actor_admin_id, reason_code, reason, created_at
     )
     select x.status_log_id::uuid, x.id::uuid, null,
            'submitted'::booking_request_status, 'user'::booking_request_actor_type,
            x.user_id::uuid, null, 'live_fixture_submitted', null,
            x.created_at::timestamptz
     from jsonb_to_recordset($1::jsonb) as x(
       id text, status_log_id text, user_id text, created_at text
     )`,
    [JSON.stringify(bookings.map(toDatabaseKeys))],
  );
}

function toDatabaseKeys(value) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), item]),
  );
}

function tracedPool(pool, bookingQueryTrace) {
  return {
    async connect() {
      const client = await pool.connect();
      return {
        query(sql, params = []) {
          const statement = String(sql);
          if (
            /from\s+booking_requests\s+b/i.test(statement) &&
            /b\.user_id\s*=\s*\$1::uuid/i.test(statement) &&
            /\(b\.created_at,\s*b\.id\)\s*</i.test(statement)
          ) {
            bookingQueryTrace.push({ cursorTimestamp: params[2] ?? null });
          }
          return client.query(sql, params);
        },
        release() {
          client.release();
        },
      };
    },
  };
}

async function recoverSessions(store, fixture) {
  const recovered = {};
  for (const [name, session] of Object.entries(fixture.sessions)) {
    recovered[name] = await store.sessionWrites.findByToken(session.token);
    assert(recovered[name], `session ${name} must be restored from PostgreSQL`);
    assert(recovered[name].id === session.id, `session ${name} must preserve its persisted id`);
  }
  assert(
    recovered.consumerAFirst.id !== recovered.consumerASecond.id,
    'two consumer A device sessions must remain distinct',
  );
  assert(
    recovered.consumerAFirst.user.id === recovered.consumerASecond.user.id,
    'two consumer A sessions must restore the same owner',
  );
  assert(recovered.adminA.adminId === fixture.admins.adminA.id, 'admin A session must restore admin ownership');
  assert(recovered.adminB.adminId === fixture.admins.adminB.id, 'admin B session must restore admin ownership');
  assert(
    recovered.adminA.adminScope.includes('booking_requests:write'),
    'admin A session must restore booking write scope',
  );
  return recovered;
}

async function assertCreateIdempotencyAndIsolation(store, sessions, fixture) {
  const requestA = fixture.requests.replayA;
  const draftA = gatewayDraft(requestA, sessions.consumerAFirst.user.id);
  const created = await store.bookingRequests.createForConsumer(draftA);
  const replayed = await store.bookingRequests.createForConsumer(draftA);
  assert(created.id === requestA.id, 'create must preserve the fixture booking id');
  assert(JSON.stringify(replayed) === JSON.stringify(created), 'same payload replay must return the same public result');
  assertNoConsumerSecrets(created, fixture, 'created consumer detail');

  await assertRejects(
    () =>
      store.bookingRequests.createForConsumer({
        ...draftA,
        requirements: `${draftA.requirements} changed`,
      }),
    'BOOKING_IDEMPOTENCY_CONFLICT',
    409,
    'same user and client key with different payload must conflict',
  );

  const requestB = fixture.requests.replayB;
  const createdForB = await store.bookingRequests.createForConsumer(
    gatewayDraft(requestB, sessions.consumerB.user.id),
  );
  assert(createdForB.id === requestB.id, 'the same client key must be independently usable by another user');
  assert(createdForB.id !== created.id, 'cross-user idempotency scope must not alias booking ids');

  await assertRejects(
    () =>
      store.bookingRequests.getForConsumer({
        userId: sessions.consumerB.user.id,
        bookingRequestId: requestA.id,
      }),
    'BOOKING_REQUEST_NOT_FOUND',
    404,
    'another user must not enumerate booking detail',
  );
  const userBList = await store.bookingRequests.listForConsumer({
    userId: sessions.consumerB.user.id,
    limit: 50,
  });
  assert(userBList.items.some((item) => item.id === requestB.id), 'user B must list its own booking');
  assert(!userBList.items.some((item) => item.id === requestA.id), 'user B list must exclude user A booking');
  for (const item of userBList.items) assertNoConsumerSecrets(item, fixture, 'user B list item');
}

function gatewayDraft(request, userId = request.userId) {
  return {
    bookingRequestId: request.id,
    statusLogId: request.statusLogId,
    userId,
    companionId: request.companionId,
    clientRequestId: request.clientRequestId,
    requestedStartAt: request.requestedStartAt,
    requestedEndAt: request.requestedEndAt,
    timezone: request.timezone,
    city: request.city,
    addressText: request.addressText,
    requirements: request.requirements,
  };
}

async function assertPagination(control, store, sessions, fixture, bookingQueryTrace) {
  const userId = sessions.consumerAFirst.user.id;
  const expectedAll = await canonicalBookingIds(control, userId, null);
  const collectedAll = await collectConsumerPages(store, userId, null, fixture);
  assert(collectedAll.length > 100, 'consumer pagination audit requires more than 100 rows');
  assert(JSON.stringify(collectedAll) === JSON.stringify(expectedAll), 'all-status pagination must match PostgreSQL order');

  const expectedSubmitted = await canonicalBookingIds(control, userId, 'submitted');
  const collectedSubmitted = await collectConsumerPages(store, userId, 'submitted', fixture);
  assert(
    JSON.stringify(collectedSubmitted) === JSON.stringify(expectedSubmitted),
    'submitted pagination must match PostgreSQL order',
  );
  assert(new Set(collectedAll).size === collectedAll.length, 'pagination must not duplicate booking ids');
  assertMicrosecondCursorParameters(bookingQueryTrace);

  const firstDevice = await store.bookingRequests.listForConsumer({ userId, limit: 25 });
  const secondDevice = await store.bookingRequests.listForConsumer({
    userId: sessions.consumerASecond.user.id,
    limit: 25,
  });
  assert(
    JSON.stringify(firstDevice) === JSON.stringify(secondDevice),
    'two restored device sessions must observe the same booking page',
  );
}

async function collectConsumerPages(store, userId, status, fixture) {
  const ids = [];
  let cursor = null;
  for (let page = 0; page < 100; page += 1) {
    const result = await store.bookingRequests.listForConsumer({
      userId,
      status: status || undefined,
      limit: PAGE_LIMIT,
      cursor: cursor || undefined,
    });
    assert(result.items.length <= PAGE_LIMIT, 'gateway must respect requested page limit');
    for (const item of result.items) {
      assertNoConsumerSecrets(item, fixture, 'consumer pagination item');
      ids.push(item.id);
    }
    if (!result.nextCursor) {
      assert(result.hasMore === false, 'final page must not claim more rows');
      return ids;
    }
    assert(result.hasMore === true, 'continuation cursor requires hasMore=true');
    cursor = result.nextCursor;
  }
  throw new Error('consumer pagination did not terminate');
}

async function canonicalBookingIds(client, userId, status) {
  const result = await client.query(
    `select id
     from booking_requests
     where user_id = $1::uuid
       and ($2::booking_request_status is null or status = $2::booking_request_status)
     order by created_at desc, id desc`,
    [userId, status],
  );
  return result.rows.map((row) => String(row.id));
}

function assertMicrosecondCursorParameters(trace) {
  const timestamps = trace
    .map((entry) => entry.cursorTimestamp)
    .filter((value) => value !== null && value !== undefined)
    .map(String);
  assert(timestamps.length > 0, 'pagination must send continuation timestamps to PostgreSQL');
  assert(
    timestamps.every((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)),
    'every booking continuation timestamp must retain six fractional digits',
  );
  assert(
    timestamps.some((value) => !value.endsWith('000Z')),
    'at least one continuation timestamp must retain sub-millisecond precision',
  );
}

async function assertAdminContactBoundary(store, sessions, fixture) {
  const consumerPage = await store.bookingRequests.listForConsumer({
    userId: sessions.consumerAFirst.user.id,
    limit: 10,
  });
  for (const item of consumerPage.items) assertNoConsumerSecrets(item, fixture, 'consumer contact boundary');

  const adminPage = await store.bookingRequests.listForAdmin({
    adminId: sessions.adminA.adminId,
    status: 'submitted',
    limit: 50,
  });
  const fixtureIds = new Set(fixture.paginationBookings.map((item) => item.id));
  const item = adminPage.items.find((candidate) => fixtureIds.has(candidate.id));
  assert(item, 'admin queue must include at least one fixture booking');
  const source = fixture.paginationBookings.find((candidate) => candidate.id === item.id);
  const companionOwner =
    source.companionId === fixture.companions.photographerA.id
      ? fixture.users.photographerOwnerA
      : fixture.users.photographerOwnerB;
  assert(item.consumer.phoneMasked === maskPhone(fixture.users.consumerA.phone), 'admin list must mask consumer phone');
  assert(item.companionPhoneMasked === maskPhone(companionOwner.phone), 'admin list must mask photographer phone');
  assert(!JSON.stringify(adminPage).includes(fixture.users.consumerA.phone), 'admin list must not expose full consumer phone');
  assert(!JSON.stringify(adminPage).includes(companionOwner.phone), 'admin list must not expose full photographer phone');

  const detail = await store.bookingRequests.getForAdmin({
    adminId: sessions.adminA.adminId,
    bookingRequestId: fixture.requests.replayA.id,
    includeContact: true,
  });
  assert(detail.consumer.phone === fixture.users.consumerA.phone, 'protected admin detail must expose consumer phone');
  assert(
    detail.companionPhone === fixture.users.photographerOwnerA.phone,
    'protected admin detail must expose photographer phone',
  );
  const readOnlyDetail = await store.bookingRequests.getForAdmin({
    adminId: sessions.adminA.adminId,
    bookingRequestId: fixture.requests.replayA.id,
    includeContact: false,
  });
  assert(readOnlyDetail.consumer.phone === null, 'read-only admin detail must not expose consumer phone');
  assert(readOnlyDetail.companionPhone === null, 'read-only admin detail must not expose photographer phone');
}

async function assertConfirmCancelFlow(control, store, sessions, fixture) {
  const request = fixture.requests.confirmCancel;
  await store.bookingRequests.createForConsumer(gatewayDraft(request, sessions.consumerAFirst.user.id));
  const confirmed = await store.bookingRequests.confirmForAdmin({
    ...adminCommandBase(sessions.adminA.adminId, request.id),
    statusLogId: randomUUID(),
    adminActionLogId: fixture.actions.confirmCancel,
    ...confirmationDraft('confirm-cancel'),
    publicMessage: '平台已确认预约。',
    internalNote: fixture.privateMarker,
  });
  assert(confirmed.status === 'confirmed', 'admin confirmation must produce confirmed status');

  const cancelled = await store.bookingRequests.cancelForConsumer({
    userId: sessions.consumerASecond.user.id,
    bookingRequestId: request.id,
    statusLogId: randomUUID(),
    reasonCode: 'plans_changed',
    reason: '用户行程变化',
  });
  assert(cancelled.status === 'cancelled', 'confirmed booking must support consumer cancellation');
  assertNoConsumerSecrets(cancelled, fixture, 'cancelled consumer detail');
  assert(!JSON.stringify(cancelled).includes(fixture.privateMarker), 'internal admin note must never reach consumer detail');

  const replayedCancel = await store.bookingRequests.cancelForConsumer({
    userId: sessions.consumerAFirst.user.id,
    bookingRequestId: request.id,
    reasonCode: 'different_retry_reason',
    reason: '重复取消',
  });
  assert(replayedCancel.status === 'cancelled', 'same target cancellation must replay idempotently');

  const logs = await control.query(
    `select from_status, to_status, actor_type
     from booking_request_status_logs
     where booking_request_id = $1::uuid
     order by created_at, id`,
    [request.id],
  );
  assert(
    JSON.stringify(logs.rows.map((row) => row.to_status)) === JSON.stringify(['submitted', 'confirmed', 'cancelled']),
    'confirm/cancel flow must create one legal status-log sequence',
  );
  const audit = await control.query(
    `select id, action, before_data, after_data
     from admin_action_logs
     where target_type = 'booking_request'
       and target_id = $1::uuid`,
    [request.id],
  );
  assert(audit.rowCount === 1, 'confirmation must write one admin action log');
  assert(audit.rows[0].action === 'booking_request.confirmed', 'confirmation audit action must be explicit');
  assert(audit.rows[0].after_data.internalNote === fixture.privateMarker, 'protected audit must retain internal note');
}

async function assertConcurrentConfirm(control, store, sessions, fixture) {
  const request = fixture.requests.concurrentConfirm;
  await store.bookingRequests.createForConsumer(gatewayDraft(request, sessions.consumerAFirst.user.id));
  const confirmation = confirmationDraft('concurrent-confirm');
  const commands = [
    {
      ...adminCommandBase(sessions.adminA.adminId, request.id),
      statusLogId: randomUUID(),
      adminActionLogId: fixture.actions.concurrentA,
      ...confirmation,
      publicMessage: '并发确认 A',
    },
    {
      ...adminCommandBase(sessions.adminB.adminId, request.id),
      statusLogId: randomUUID(),
      adminActionLogId: fixture.actions.concurrentB,
      ...confirmation,
      publicMessage: '并发确认 B',
    },
  ];
  const results = await Promise.all(commands.map((command) => store.bookingRequests.confirmForAdmin(command)));
  assert(results.every((item) => item.status === 'confirmed'), 'both same-target retries must observe confirmed result');

  const state = await control.query(
    `select status from booking_requests where id = $1::uuid`,
    [request.id],
  );
  assert(state.rows[0]?.status === 'confirmed', 'concurrent confirmation must leave a legal confirmed state');
  const logCount = await scalar(
    control,
    `select count(*)::integer as value
     from booking_request_status_logs
     where booking_request_id = $1::uuid
       and to_status = 'confirmed'`,
    [request.id],
  );
  const auditCount = await scalar(
    control,
    `select count(*)::integer as value
     from admin_action_logs
     where target_type = 'booking_request'
       and target_id = $1::uuid
       and action = 'booking_request.confirmed'`,
    [request.id],
  );
  assert(logCount === 1, 'concurrent double confirm must write exactly one confirmed status log');
  assert(auditCount === 1, 'concurrent double confirm must write exactly one admin audit row');
}

async function assertAdminAuditRollback(control, store, sessions, fixture) {
  const request = fixture.requests.atomicRollback;
  await store.bookingRequests.createForConsumer(gatewayDraft(request, sessions.consumerAFirst.user.id));
  await assertRejects(
    () =>
      store.bookingRequests.confirmForAdmin({
        ...adminCommandBase(sessions.adminA.adminId, request.id),
        statusLogId: fixture.actions.atomicStatusLog,
        adminActionLogId: fixture.actions.confirmCancel,
        ...confirmationDraft('atomic-rollback'),
        publicMessage: '该动作必须整体回滚',
        internalNote: fixture.privateMarker,
      }),
    'BOOKING_STORE_UNAVAILABLE',
    503,
    'admin audit insertion failure must surface as a stable store error',
  );

  const state = await control.query(
    `select status from booking_requests where id = $1::uuid`,
    [request.id],
  );
  assert(state.rows[0]?.status === 'submitted', 'failed audit insertion must roll booking status back to submitted');
  const confirmedLogs = await scalar(
    control,
    `select count(*)::integer as value
     from booking_request_status_logs
     where booking_request_id = $1::uuid
       and to_status = 'confirmed'`,
    [request.id],
  );
  const targetAudits = await scalar(
    control,
    `select count(*)::integer as value
     from admin_action_logs
     where target_type = 'booking_request'
       and target_id = $1::uuid`,
    [request.id],
  );
  assert(confirmedLogs === 0, 'failed admin audit must not leave a confirmed status log');
  assert(targetAudits === 0, 'failed admin audit must not leave a target audit row');
}

function adminCommandBase(adminId, bookingRequestId) {
  return {
    adminId,
    bookingRequestId,
    ip: '127.0.0.1',
    userAgent: 'store-lite-booking-live-audit',
  };
}

function confirmationDraft(label) {
  return {
    confirmedStartAt: '2035-03-01T02:30:00.000Z',
    confirmedEndAt: '2035-03-01T04:30:00.000Z',
    confirmedCity: '上海',
    confirmedAddressText: `Store Lite confirmed address ${label}`,
    arrivalInstructions: '请提前十分钟到达，并向平台客服确认预约编号。',
    supportChannelKey: 'store_lite.support',
  };
}

function assertNoConsumerSecrets(value, fixture, label) {
  walk(value, (key) => {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    assert(!FORBIDDEN_CONSUMER_KEYS.has(normalized), `${label} leaked forbidden key ${key}`);
  });
  const serialized = JSON.stringify(value);
  for (const user of Object.values(fixture.users)) {
    assert(!serialized.includes(user.phone), `${label} leaked a raw phone value`);
  }
  assert(!serialized.includes(fixture.privateMarker), `${label} leaked an internal operations marker`);
}

function walk(value, visitKey) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visitKey);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    visitKey(key);
    walk(item, visitKey);
  }
}

function maskPhone(value) {
  const phone = String(value || '').trim();
  if (phone.length <= 4) return '*'.repeat(phone.length);
  if (phone.length <= 7) return `${phone.slice(0, 2)}${'*'.repeat(phone.length - 4)}${phone.slice(-2)}`;
  return `${phone.slice(0, 3)}${'*'.repeat(phone.length - 7)}${phone.slice(-4)}`;
}

async function scalar(client, sql, params) {
  const result = await client.query(sql, params);
  return Number(result.rows?.[0]?.value || 0);
}

async function assertRejects(action, expectedCode, expectedStatus, message) {
  try {
    await action();
  } catch (error) {
    assert(error?.code === expectedCode, `${message}: expected ${expectedCode}, received ${error?.code || 'none'}`);
    assert(error?.status === expectedStatus, `${message}: expected HTTP ${expectedStatus}, received ${error?.status}`);
    return error;
  }
  throw new Error(`${message}: action unexpectedly succeeded`);
}

async function cleanupFixture(client, fixture) {
  let began = false;
  try {
    await client.query('begin');
    began = true;
    await client.query(`set local statement_timeout = '30s'`);
    await client.query(`set local lock_timeout = '5s'`);
    await client.query(
      `delete from admin_action_logs
       where target_type = 'booking_request'
         and target_id = any($1::uuid[])`,
      [fixture.allBookingIds],
    );
    await client.query(`delete from booking_requests where id = any($1::uuid[])`, [fixture.allBookingIds]);
    await client.query(
      `delete from user_sessions where id = any($1::uuid[])`,
      [Object.values(fixture.sessions).map((item) => item.id)],
    );
    await client.query(
      `delete from companions where id = any($1::uuid[])`,
      [Object.values(fixture.companions).map((item) => item.id)],
    );
    await client.query(
      `delete from admin_users where id = any($1::uuid[])`,
      [Object.values(fixture.admins).map((item) => item.id)],
    );
    await client.query(
      `delete from users where id = any($1::uuid[])`,
      [Object.values(fixture.users).map((item) => item.id)],
    );
    await client.query('commit');
    began = false;
  } catch (error) {
    if (began) {
      try {
        await client.query('rollback');
      } catch {
        // Preserve the cleanup failure.
      }
    }
    throw error;
  }
}

async function assertFixtureAbsent(client, fixture) {
  const checks = [
    ['booking_requests', 'id', fixture.allBookingIds],
    ['booking_request_status_logs', 'booking_request_id', fixture.allBookingIds],
    ['admin_action_logs', 'target_id', fixture.allBookingIds],
    ['user_sessions', 'id', Object.values(fixture.sessions).map((item) => item.id)],
    ['companions', 'id', Object.values(fixture.companions).map((item) => item.id)],
    ['admin_users', 'id', Object.values(fixture.admins).map((item) => item.id)],
    ['users', 'id', Object.values(fixture.users).map((item) => item.id)],
  ];
  for (const [table, column, ids] of checks) {
    const count = await scalar(client, `select count(*)::integer as value from ${table} where ${column} = any($1::uuid[])`, [ids]);
    assert(count === 0, `fixture cleanup left ${count} row(s) in ${table}`);
  }
}

function sanitizeError(error, rawUrl) {
  let message = error instanceof SafetyRefusalError ? error.message : databaseErrorSummary(error);
  const secrets = [rawUrl];
  try {
    const parsed = rawUrl ? new URL(rawUrl) : null;
    if (parsed?.username) secrets.push(decodeURIComponent(parsed.username));
    if (parsed?.password) secrets.push(decodeURIComponent(parsed.password));
  } catch {
    // Invalid URLs are already represented by a non-sensitive refusal message.
  }
  for (const secret of secrets.filter(Boolean)) message = message.split(secret).join('[REDACTED]');
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/(password|passcode|secret)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 1000);
}

function databaseErrorSummary(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || error || 'Unknown failure').trim();
  return code ? `${code}: ${message}` : message;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
