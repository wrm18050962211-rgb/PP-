import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';

import { createPostgresStore } from '../store/postgresStore.mjs';
import { hashSessionToken } from '../store/sessionTokenHash.mjs';

const { Client } = pg;

const REQUIRED_DATABASE_NAME = 'pp_platform_ci';
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const REQUIRED_TABLES = [
  'users',
  'companions',
  'companion_tags',
  'service_areas',
  'activity_pricings',
  'companion_extras',
  'availability_slots',
  'posts',
  'post_images',
  'post_tags',
  'favorites',
  'admin_users',
  'user_sessions',
  'booking_requests',
  'user_requests',
  'user_request_status_logs',
  'reports',
  'user_companion_blocks',
  'admin_action_logs',
];
const FORBIDDEN_CONSUMER_KEYS = new Set([
  'adminid',
  'actoradminid',
  'handledby',
  'handledbyadminid',
  'internalnote',
  'clientrequestid',
  'requestfingerprint',
  'phone',
  'phonemasked',
  'reporter',
  'reporterid',
  'reporteduserid',
]);

class SafetyRefusalError extends Error {}

try {
  await runStoreLiteComplianceAudit();
} catch (error) {
  const rawUrl = String(process.env.STORE_LITE_COMPLIANCE_TEST_DATABASE_URL || '').trim();
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

async function runStoreLiteComplianceAudit() {
  const connectionConfig = readConnectionConfig(process.env);
  const fixture = buildFixture();
  const control = new Client({
    ...connectionConfig,
    application_name: 'still-store-lite-compliance-live',
    connectionTimeoutMillis: 5000,
    query_timeout: 30000,
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 30000,
  });
  const checks = [];
  let connected = false;
  let outerTransaction = false;
  let fixturesInserted = false;
  let auditError = null;
  let cleanupError = null;

  try {
    await control.connect();
    connected = true;
    await assertDatabaseSafety(control);
    await assertRequiredTables(control);
    checks.push('isolated-local-database', 'postgresql-16', 'public-canonical-schema');

    await control.query('begin');
    outerTransaction = true;
    await control.query(`set local statement_timeout = '30s'`);
    await control.query(`set local lock_timeout = '5s'`);
    fixturesInserted = true;
    await insertFixture(control, fixture);
    await assertFixturePresent(control, fixture);
    checks.push('single-transaction-fixtures', 'random-uuid-fixtures', 'fixture-presence-verified');

    const store = createPostgresStore({
      databaseUrl: 'postgresql://store-lite-compliance-live/pp_platform_ci',
      poolFactory: () => createSavepointPool(control),
      featureFlags: { storeLiteComplianceEnabled: true },
    });
    assert(store.capabilities.storeLiteCompliance === true, 'Store Lite compliance capability must be enabled');
    assert(store.storeLiteCompliance, 'Store Lite compliance gateway must be exposed when enabled');

    const sessions = await recoverSessions(store, fixture);
    checks.push('two-consumer-sessions', 'cross-session-owner-recovery', 'second-consumer-isolation');

    await assertUserRequestFlows(control, store, sessions, fixture);
    checks.push(
      'user-request-idempotency',
      'user-request-owner-isolation',
      'user-request-status-sequence',
      'user-request-admin-audit',
      'account-deletion-admin-completion-forbidden',
    );

    await assertBlockAndContentFiltering(control, store, sessions, fixture);
    checks.push('block-unblock-idempotency', 'blocked-content-filtering', 'cross-user-content-visibility');

    await assertContentReportFlows(control, store, sessions, fixture);
    checks.push(
      'content-report-target-resolution',
      'content-report-idempotency',
      'content-report-owner-isolation',
      'remove-post-resolution-side-effect',
      'suspend-companion-resolution-side-effect',
      'content-report-admin-audit',
      'consumer-dto-redaction',
    );
  } catch (error) {
    auditError = error;
  } finally {
    if (connected && outerTransaction) {
      try {
        await control.query('rollback');
        outerTransaction = false;
        checks.push('outer-transaction-rolled-back');
      } catch (error) {
        cleanupError = error;
      }
    }
    if (connected && fixturesInserted && !outerTransaction) {
      try {
        await assertFixtureAbsent(control, fixture);
        checks.push('rollback-fixture-count-zero');
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
      auditError.message = `${auditError.message}; rollback verification failure: ${databaseErrorSummary(cleanupError)}`;
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
        checks,
      },
      null,
      2,
    ),
  );
}

function readConnectionConfig(env) {
  if (env.ALLOW_STORE_LITE_COMPLIANCE_LIVE_TEST !== '1') {
    throw new SafetyRefusalError(
      'ALLOW_STORE_LITE_COMPLIANCE_LIVE_TEST=1 is required; Store Lite compliance live audit was skipped',
    );
  }

  const rawUrl = String(env.STORE_LITE_COMPLIANCE_TEST_DATABASE_URL || '').trim();
  if (!rawUrl) {
    throw new SafetyRefusalError(
      'STORE_LITE_COMPLIANCE_TEST_DATABASE_URL is required; DATABASE_URL is intentionally ignored and the audit was skipped',
    );
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SafetyRefusalError('STORE_LITE_COMPLIANCE_TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new SafetyRefusalError('STORE_LITE_COMPLIANCE_TEST_DATABASE_URL must use postgres or postgresql');
  }
  if (parsed.search || parsed.hash) {
    throw new SafetyRefusalError('STORE_LITE_COMPLIANCE_TEST_DATABASE_URL must not contain query parameters or a fragment');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    throw new SafetyRefusalError('Store Lite compliance live audit only accepts localhost, 127.0.0.1, or ::1');
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (database !== REQUIRED_DATABASE_NAME) {
    throw new SafetyRefusalError(`Store Lite compliance live audit only accepts database ${REQUIRED_DATABASE_NAME}`);
  }
  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new SafetyRefusalError('STORE_LITE_COMPLIANCE_TEST_DATABASE_URL contains an invalid port');
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
  assert(row.schema_name === 'public', 'Store Lite compliance live audit requires the public schema');
  assert(
    row.server_version_num >= 160000 && row.server_version_num < 170000,
    'Store Lite compliance live audit requires PostgreSQL 16.x',
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
    consumerA: fixtureUser(`SLC Consumer A ${runId}`, false, allocatedPhones),
    consumerB: fixtureUser(`SLC Consumer B ${runId}`, false, allocatedPhones),
    postOwner: fixtureUser(`SLC Post Owner ${runId}`, true, allocatedPhones),
    profileOwner: fixtureUser(`SLC Profile Owner ${runId}`, true, allocatedPhones),
    blockOwner: fixtureUser(`SLC Block Owner ${runId}`, true, allocatedPhones),
  };
  const companions = {
    postTarget: fixtureCompanion(users.postOwner.id, `SLC Post Target ${runId}`),
    profileTarget: fixtureCompanion(users.profileOwner.id, `SLC Profile Target ${runId}`),
    blockTarget: fixtureCompanion(users.blockOwner.id, `SLC Block Target ${runId}`),
  };
  const posts = {
    reportTarget: fixturePost(companions.postTarget.id, `SLC Report Post ${runId}`),
    blockTarget: fixturePost(companions.blockTarget.id, `SLC Block Post ${runId}`),
  };
  const admin = {
    id: randomUUID(),
    username: `slc_ops_${runId}`,
    name: `SLC Ops ${runId}`,
    role: 'store_lite_ops',
  };
  const sessions = {
    consumerAFirst: fixtureSession(users.consumerA.id),
    consumerASecond: fixtureSession(users.consumerA.id),
    consumerB: fixtureSession(users.consumerB.id),
  };
  const userRequests = {
    replay: fixtureUserRequest(runId, 'replay', 'data_access'),
    completed: fixtureUserRequest(runId, 'completed', 'support', 'privacy'),
    accountDeletion: fixtureUserRequest(runId, 'account-deletion', 'account_deletion'),
  };
  const reports = {
    post: fixtureReport(runId, 'post'),
    companion: fixtureReport(runId, 'companion'),
  };
  const privateMarker = `internal-${runId}-${randomUUID()}`;

  return {
    runId,
    users,
    companions,
    posts,
    admin,
    sessions,
    userRequests,
    reports,
    blockId: randomUUID(),
    privateMarker,
  };
}

function fixtureUser(nickname, isCompanion, allocatedPhones) {
  let phone;
  do {
    phone = `13${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
  } while (allocatedPhones.has(phone));
  allocatedPhones.add(phone);
  return { id: randomUUID(), phone, nickname, isCompanion };
}

function fixtureCompanion(userId, displayName) {
  return { id: randomUUID(), userId, displayName };
}

function fixturePost(companionId, caption) {
  return { id: randomUUID(), imageId: randomUUID(), companionId, caption };
}

function fixtureSession(userId) {
  const token = `store-lite-compliance-live-${randomUUID()}-${randomUUID()}`;
  return {
    id: randomUUID(),
    token,
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

function fixtureUserRequest(runId, suffix, requestType, supportCategory = null) {
  return {
    id: randomUUID(),
    statusLogId: randomUUID(),
    clientRequestId: `slc-${runId}-${suffix}`,
    requestType,
    supportCategory,
    description: `Store Lite compliance request ${suffix}`,
  };
}

function fixtureReport(runId, suffix) {
  return {
    id: randomUUID(),
    clientRequestId: `slc-${runId}-report-${suffix}`,
    description: `Store Lite compliance report ${suffix}`,
  };
}

async function insertFixture(client, fixture) {
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
       id, user_id, display_name, base_city, bio, real_photo_url,
       status, service_enabled, created_at, updated_at
     )
     select x.id::uuid, x.user_id::uuid, x.display_name, '上海',
            'Store Lite compliance live fixture',
            'https://audit.invalid/store-lite-companion.jpg',
            'approved'::companion_status, true, now(), now()
     from jsonb_to_recordset($1::jsonb) as x(id text, user_id text, display_name text)`,
    [JSON.stringify(Object.values(fixture.companions).map(toDatabaseKeys))],
  );
  await client.query(
    `insert into posts (
       id, companion_id, city, location_name, time_label, caption,
       status, is_feed_visible, is_featured, quality_score, published_at,
       created_at, updated_at
     )
     select x.id::uuid, x.companion_id::uuid, '上海', 'Store Lite audit location',
            '工作日下午', x.caption, 'approved'::post_status, true, false, 80,
            now(), now(), now()
     from jsonb_to_recordset($1::jsonb) as x(id text, companion_id text, caption text)`,
    [JSON.stringify(Object.values(fixture.posts).map(toDatabaseKeys))],
  );
  await client.query(
    `insert into post_images (
       id, post_id, file_url, sort_order, audit_status, created_at
     )
     select x.image_id::uuid, x.id::uuid,
            'https://audit.invalid/store-lite-post.jpg', 1, 'approved'::audit_status, now()
     from jsonb_to_recordset($1::jsonb) as x(id text, image_id text)`,
    [JSON.stringify(Object.values(fixture.posts).map(toDatabaseKeys))],
  );
  await client.query(
    `insert into admin_users (
       id, username, password_hash, name, role, status, created_at, updated_at
     ) values ($1::uuid, $2, 'unused-live-audit-hash', $3, $4, 'active', now(), now())`,
    [fixture.admin.id, fixture.admin.username, fixture.admin.name, fixture.admin.role],
  );
  await client.query(
    `insert into user_sessions (
       id, token_hash, session_scope, user_id, role, provider, device_id,
       metadata, login_at, last_seen_at, expires_at, created_at, updated_at
     )
     select x.id::uuid, x.token_hash, 'user', x.user_id::uuid, 'consumer',
            'live-audit', x.id, '{}'::jsonb, now(), now(), x.expires_at::timestamptz,
            now(), now()
     from jsonb_to_recordset($1::jsonb) as x(
       id text, token_hash text, user_id text, expires_at text
     )`,
    [
      JSON.stringify(
        Object.values(fixture.sessions).map(({ token: _token, ...session }) => toDatabaseKeys(session)),
      ),
    ],
  );
}

function createSavepointPool(client) {
  let sequence = 0;
  return {
    async connect() {
      const savepoints = [];
      return {
        async query(sql, params = []) {
          const command = String(sql).trim().replace(/;$/, '').toLowerCase();
          if (command === 'begin') {
            const savepoint = `store_lite_compliance_${sequence += 1}`;
            savepoints.push(savepoint);
            return client.query(`savepoint ${savepoint}`);
          }
          if (command === 'commit') {
            const savepoint = savepoints.pop();
            assert(savepoint, 'gateway attempted to commit without a matching transaction');
            return client.query(`release savepoint ${savepoint}`);
          }
          if (command === 'rollback') {
            const savepoint = savepoints.pop();
            assert(savepoint, 'gateway attempted to roll back without a matching transaction');
            await client.query(`rollback to savepoint ${savepoint}`);
            return client.query(`release savepoint ${savepoint}`);
          }
          return client.query(sql, params);
        },
        release() {
          assert(savepoints.length === 0, 'gateway released a client with an open savepoint');
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
  }
  assert(
    recovered.consumerAFirst.id !== recovered.consumerASecond.id,
    'the two consumer A sessions must remain distinct',
  );
  assert(
    recovered.consumerAFirst.user.id === recovered.consumerASecond.user.id,
    'the two consumer A sessions must restore the same owner',
  );
  assert(
    recovered.consumerB.user.id !== recovered.consumerAFirst.user.id,
    'the second consumer principal must remain isolated',
  );
  return recovered;
}

async function assertUserRequestFlows(control, store, sessions, fixture) {
  const gateway = store.storeLiteCompliance;
  const ownerId = sessions.consumerAFirst.user.id;
  const secondOwnerSessionId = sessions.consumerASecond.user.id;
  const otherUserId = sessions.consumerB.user.id;
  const replay = fixture.userRequests.replay;
  const replayDraft = userRequestDraft(replay, ownerId);

  const created = await gateway.createUserRequestForConsumer(replayDraft);
  const replayed = await gateway.createUserRequestForConsumer(replayDraft);
  assert(created.id === replay.id, 'user request create must preserve the supplied fixture id');
  assert(JSON.stringify(replayed) === JSON.stringify(created), 'same user request payload must replay idempotently');
  assertPublicDto(created, fixture, 'created user request');

  await assertRejects(
    () => gateway.createUserRequestForConsumer({ ...replayDraft, description: `${replay.description} changed` }),
    'USER_REQUEST_IDEMPOTENCY_CONFLICT',
    409,
    'changed user request payload must conflict with its idempotency key',
  );
  const secondSessionDetail = await gateway.getUserRequestForConsumer({
    userId: secondOwnerSessionId,
    userRequestId: replay.id,
  });
  assert(secondSessionDetail.id === replay.id, 'second session must read a request created by the first session');
  await assertRejects(
    () => gateway.getUserRequestForConsumer({ userId: otherUserId, userRequestId: replay.id }),
    'USER_REQUEST_NOT_FOUND',
    404,
    'another owner must not enumerate user request detail',
  );
  const cancelled = await gateway.cancelUserRequestForConsumer({
    userId: secondOwnerSessionId,
    userRequestId: replay.id,
    statusLogId: randomUUID(),
    reasonCode: 'consumer_cancelled',
    reason: '用户撤回申请',
  });
  assert(cancelled.status === 'cancelled', 'second session must be able to cancel its owner request');
  assertPublicDto(cancelled, fixture, 'cancelled user request');

  const completed = fixture.userRequests.completed;
  await gateway.createUserRequestForConsumer(userRequestDraft(completed, ownerId));
  const started = await gateway.startUserRequestForAdmin({
    ...adminActor(fixture),
    userRequestId: completed.id,
    statusLogId: randomUUID(),
    adminActionLogId: randomUUID(),
    publicMessage: '平台已开始处理。',
    internalNote: fixture.privateMarker,
  });
  assert(started.status === 'processing', 'admin start must move a support request to processing');
  const completedResult = await gateway.completeUserRequestForAdmin({
    ...adminActor(fixture),
    userRequestId: completed.id,
    statusLogId: randomUUID(),
    adminActionLogId: randomUUID(),
    publicMessage: '请求已处理完成。',
    internalNote: fixture.privateMarker,
  });
  assert(completedResult.status === 'completed', 'admin complete must finish a processing support request');
  assertPublicDto(
    await gateway.getUserRequestForConsumer({ userId: secondOwnerSessionId, userRequestId: completed.id }),
    fixture,
    'completed user request',
  );

  const completedLogs = await control.query(
    `select from_status, to_status, actor_type
     from user_request_status_logs
     where user_request_id = $1::uuid`,
    [completed.id],
  );
  assert(
    completedLogs.rowCount === 3
      && completedLogs.rows.some(
        (row) => row.from_status === null && row.to_status === 'submitted' && row.actor_type === 'user',
      )
      && completedLogs.rows.some(
        (row) => row.from_status === 'submitted' && row.to_status === 'processing' && row.actor_type === 'admin',
      )
      && completedLogs.rows.some(
        (row) => row.from_status === 'processing' && row.to_status === 'completed' && row.actor_type === 'admin',
      ),
    'completed support request must retain its legal status sequence',
  );
  const completedAudits = await actionRows(control, 'user_request', completed.id);
  assert(
    JSON.stringify(completedAudits.map((row) => row.action).sort())
      === JSON.stringify(['user_request.completed', 'user_request.processing']),
    'support request transitions must each write an admin action audit',
  );
  assert(
    completedAudits.every((row) => row.after_data?.internalNote === fixture.privateMarker),
    'protected admin audits must retain the internal operations note',
  );

  const deletion = fixture.userRequests.accountDeletion;
  await gateway.createUserRequestForConsumer(userRequestDraft(deletion, ownerId));
  await gateway.startUserRequestForAdmin({
    ...adminActor(fixture),
    userRequestId: deletion.id,
    statusLogId: randomUUID(),
    adminActionLogId: randomUUID(),
    publicMessage: '账号注销申请正在核验。',
    internalNote: fixture.privateMarker,
  });
  await assertRejects(
    () => gateway.completeUserRequestForAdmin({
      ...adminActor(fixture),
      userRequestId: deletion.id,
      statusLogId: randomUUID(),
      adminActionLogId: randomUUID(),
      publicMessage: '不得由运营完成。',
      internalNote: fixture.privateMarker,
    }),
    'USER_REQUEST_STATUS_CONFLICT',
    409,
    'operations admin must never complete an account deletion request',
  );
  const deletionState = await control.query(
    `select status from user_requests where id = $1::uuid`,
    [deletion.id],
  );
  assert(deletionState.rows[0]?.status === 'processing', 'refused account deletion completion must not change status');
  const deletionAudits = await actionRows(control, 'user_request', deletion.id);
  assert(
    JSON.stringify(deletionAudits.map((row) => row.action).sort()) === JSON.stringify(['user_request.processing']),
    'refused account deletion completion must not append a completion audit',
  );
}

function userRequestDraft(request, userId) {
  return {
    userRequestId: request.id,
    statusLogId: request.statusLogId,
    userId,
    requestType: request.requestType,
    supportCategory: request.supportCategory,
    description: request.description,
    clientRequestId: request.clientRequestId,
  };
}

async function assertBlockAndContentFiltering(control, store, sessions, fixture) {
  const gateway = store.storeLiteCompliance;
  const userId = sessions.consumerAFirst.user.id;
  const secondSessionUserId = sessions.consumerASecond.user.id;
  const otherUserId = sessions.consumerB.user.id;
  const companionId = fixture.companions.blockTarget.id;
  const postId = fixture.posts.blockTarget.id;

  assert(await store.content.getPublicPost(postId, { userId }), 'post must be visible before its photographer is blocked');
  assert(
    await store.content.getPublicCompanion(companionId, { userId }),
    'photographer must be visible before being blocked',
  );
  const blocked = await gateway.blockCompanionForConsumer({
    userId,
    companionId,
    blockId: fixture.blockId,
  });
  const replayedBlock = await gateway.blockCompanionForConsumer({
    userId: secondSessionUserId,
    companionId,
    blockId: randomUUID(),
  });
  assert(blocked.companionId === companionId, 'block result must resolve the target photographer');
  assert(replayedBlock.blockedAt === blocked.blockedAt, 'blocking the same photographer must replay idempotently');

  const blockedIds = await gateway.listBlockedCompanionIdsForConsumer({ userId: secondSessionUserId });
  assert(blockedIds.includes(companionId), 'second session must observe the first session block');
  const blockedPage = await gateway.listBlockedCompanionsForConsumer({ userId: secondSessionUserId, limit: 50 });
  assert(
    blockedPage.items.some((item) => item.companionId === companionId),
    'blocked photographer list must include the persisted block',
  );
  assert(!(await store.content.getPublicPost(postId, { userId })), 'blocked photographer post detail must be hidden');
  assert(
    !(await store.content.getPublicCompanion(companionId, { userId })),
    'blocked photographer profile detail must be hidden',
  );
  const ownerFeed = await store.content.listPublicPosts({ userId, limit: 50 });
  assert(!ownerFeed.items.some((post) => post.id === postId), 'blocked photographer posts must be filtered from feed');
  assert(await store.content.getPublicPost(postId, { userId: otherUserId }), 'another user must retain post visibility');
  assert(
    await store.content.getPublicCompanion(companionId, { userId: otherUserId }),
    'another user must retain photographer visibility',
  );

  const unblocked = await gateway.unblockCompanionForConsumer({
    userId: secondSessionUserId,
    companionId,
  });
  assert(unblocked.blocked === false, 'unblock must return the unblocked state');
  const replayedUnblock = await gateway.unblockCompanionForConsumer({ userId, companionId });
  assert(replayedUnblock.blocked === false, 'unblock must be idempotent');
  assert(await store.content.getPublicPost(postId, { userId }), 'post must become visible after unblock');
  assert(await store.content.getPublicCompanion(companionId, { userId }), 'profile must become visible after unblock');
  const persisted = await scalar(
    control,
    `select count(*)::integer as value
     from user_companion_blocks
     where user_id = $1::uuid and companion_id = $2::uuid`,
    [userId, companionId],
  );
  assert(persisted === 0, 'unblock must remove the persisted relationship');
}

async function assertContentReportFlows(control, store, sessions, fixture) {
  const gateway = store.storeLiteCompliance;
  const userId = sessions.consumerAFirst.user.id;
  const secondSessionUserId = sessions.consumerASecond.user.id;
  const otherUserId = sessions.consumerB.user.id;
  const postReport = fixture.reports.post;
  const postDraft = {
    reportId: postReport.id,
    userId,
    targetType: 'post',
    targetId: fixture.posts.reportTarget.id,
    category: 'content_violation',
    description: postReport.description,
    clientRequestId: postReport.clientRequestId,
  };
  const createdPostReport = await gateway.createContentReportForConsumer(postDraft);
  const replayedPostReport = await gateway.createContentReportForConsumer(postDraft);
  assert(createdPostReport.id === postReport.id, 'post report create must preserve the fixture id');
  assert(
    JSON.stringify(replayedPostReport) === JSON.stringify(createdPostReport),
    'same post report payload must replay idempotently',
  );
  assertPublicDto(createdPostReport, fixture, 'created post report');
  await assertRejects(
    () => gateway.createContentReportForConsumer({ ...postDraft, description: `${postDraft.description} changed` }),
    'CONTENT_REPORT_IDEMPOTENCY_CONFLICT',
    409,
    'changed content report payload must conflict with its idempotency key',
  );
  await assertRejects(
    () => gateway.getContentReportForConsumer({ userId: otherUserId, reportId: postReport.id }),
    'CONTENT_REPORT_NOT_FOUND',
    404,
    'another user must not enumerate report detail',
  );
  const postTarget = await control.query(
    `select reported_user_id, target_type, target_id
     from reports where id = $1::uuid`,
    [postReport.id],
  );
  assert(postTarget.rows[0]?.reported_user_id === fixture.users.postOwner.id, 'post target must resolve its companion owner');
  assert(
    postTarget.rows[0]?.target_type === 'post'
      && postTarget.rows[0]?.target_id === fixture.posts.reportTarget.id,
    'post report must retain its resolved target identity',
  );

  await gateway.investigateContentReportForAdmin({
    ...adminActor(fixture),
    reportId: postReport.id,
    adminActionLogId: randomUUID(),
    internalNote: fixture.privateMarker,
  });
  const resolvedPost = await gateway.resolveContentReportForAdmin({
    ...adminActor(fixture),
    reportId: postReport.id,
    adminActionLogId: randomUUID(),
    resolutionAction: 'remove_post',
    publicMessage: '违规作品已下架。',
    internalNote: fixture.privateMarker,
  });
  assert(resolvedPost.status === 'resolved', 'post report must resolve');
  const removedPost = await control.query(
    `select status, is_feed_visible from posts where id = $1::uuid`,
    [fixture.posts.reportTarget.id],
  );
  assert(
    removedPost.rows[0]?.status === 'removed' && removedPost.rows[0]?.is_feed_visible === false,
    'remove_post resolution must atomically remove the target from the public feed',
  );
  assert(
    !(await store.content.getPublicPost(fixture.posts.reportTarget.id, { userId })),
    'resolved removed post must no longer be publicly readable',
  );
  const consumerPostResult = await gateway.getContentReportForConsumer({
    userId: secondSessionUserId,
    reportId: postReport.id,
  });
  assert(
    consumerPostResult.result?.resolutionAction === 'remove_post',
    'consumer result must expose only the public resolution action',
  );
  assertPublicDto(consumerPostResult, fixture, 'resolved post report');
  const postAudits = await actionRows(control, 'content_report', postReport.id);
  assert(
    JSON.stringify(postAudits.map((row) => row.action).sort())
      === JSON.stringify(['content_report.investigating', 'content_report.resolved']),
    'post report investigation and resolution must each write an admin audit',
  );
  assert(
    postAudits.every((row) => row.after_data?.internalNote === fixture.privateMarker),
    'protected report audits must retain the internal operations note',
  );

  const companionReport = fixture.reports.companion;
  const companionDraft = {
    reportId: companionReport.id,
    userId,
    targetType: 'companion',
    targetId: fixture.companions.profileTarget.id,
    category: 'safety',
    description: companionReport.description,
    clientRequestId: companionReport.clientRequestId,
  };
  await gateway.createContentReportForConsumer(companionDraft);
  const companionTarget = await control.query(
    `select reported_user_id, target_type, target_id
     from reports where id = $1::uuid`,
    [companionReport.id],
  );
  assert(
    companionTarget.rows[0]?.reported_user_id === fixture.users.profileOwner.id,
    'companion target must resolve its owning user',
  );
  assert(
    companionTarget.rows[0]?.target_type === 'companion'
      && companionTarget.rows[0]?.target_id === fixture.companions.profileTarget.id,
    'companion report must retain its resolved target identity',
  );
  const resolvedCompanion = await gateway.resolveContentReportForAdmin({
    ...adminActor(fixture),
    reportId: companionReport.id,
    adminActionLogId: randomUUID(),
    resolutionAction: 'suspend_companion',
    publicMessage: '摄影师主页已暂停展示。',
    internalNote: fixture.privateMarker,
  });
  assert(resolvedCompanion.status === 'resolved', 'companion report must resolve');
  const suspended = await control.query(
    `select status, service_enabled from companions where id = $1::uuid`,
    [fixture.companions.profileTarget.id],
  );
  assert(
    suspended.rows[0]?.status === 'suspended' && suspended.rows[0]?.service_enabled === false,
    'suspend_companion resolution must atomically suspend the public profile',
  );
  assert(
    !(await store.content.getPublicCompanion(fixture.companions.profileTarget.id, { userId })),
    'suspended companion must no longer be publicly readable',
  );
  const consumerCompanionResult = await gateway.getContentReportForConsumer({
    userId: secondSessionUserId,
    reportId: companionReport.id,
  });
  assert(
    consumerCompanionResult.result?.resolutionAction === 'suspend_companion',
    'consumer result must expose the public companion resolution action',
  );
  assertPublicDto(consumerCompanionResult, fixture, 'resolved companion report');
  const companionAudits = await actionRows(control, 'content_report', companionReport.id);
  assert(
    JSON.stringify(companionAudits.map((row) => row.action).sort()) === JSON.stringify(['content_report.resolved']),
    'companion report resolution must write one admin audit',
  );
}

function adminActor(fixture) {
  return {
    adminId: fixture.admin.id,
    ip: '127.0.0.1',
    userAgent: 'store-lite-compliance-live-audit',
  };
}

async function actionRows(client, targetType, targetId) {
  const result = await client.query(
    `select action, after_data
     from admin_action_logs
     where target_type = $1 and target_id = $2::uuid`,
    [targetType, targetId],
  );
  return result.rows || [];
}

function assertPublicDto(value, fixture, label) {
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

async function assertFixturePresent(client, fixture) {
  const counts = await fixtureCounts(client, fixture);
  assert(counts.users === Object.keys(fixture.users).length, 'fixture users were not inserted exactly');
  assert(counts.companions === Object.keys(fixture.companions).length, 'fixture companions were not inserted exactly');
  assert(counts.posts === Object.keys(fixture.posts).length, 'fixture posts were not inserted exactly');
  assert(counts.postImages === Object.keys(fixture.posts).length, 'fixture post images were not inserted exactly');
  assert(counts.admins === 1, 'fixture admin was not inserted exactly');
  assert(counts.sessions === Object.keys(fixture.sessions).length, 'fixture sessions were not inserted exactly');
}

async function assertFixtureAbsent(client, fixture) {
  const counts = await fixtureCounts(client, fixture);
  for (const [table, count] of Object.entries(counts)) {
    assert(count === 0, `outer rollback left ${count} fixture row(s) in ${table}`);
  }
}

async function fixtureCounts(client, fixture) {
  const userIds = Object.values(fixture.users).map((item) => item.id);
  const companionIds = Object.values(fixture.companions).map((item) => item.id);
  const postIds = Object.values(fixture.posts).map((item) => item.id);
  const postImageIds = Object.values(fixture.posts).map((item) => item.imageId);
  const sessionIds = Object.values(fixture.sessions).map((item) => item.id);
  const userRequestIds = Object.values(fixture.userRequests).map((item) => item.id);
  const reportIds = Object.values(fixture.reports).map((item) => item.id);
  return {
    users: await countByIds(client, 'users', 'id', userIds),
    companions: await countByIds(client, 'companions', 'id', companionIds),
    posts: await countByIds(client, 'posts', 'id', postIds),
    postImages: await countByIds(client, 'post_images', 'id', postImageIds),
    admins: await countByIds(client, 'admin_users', 'id', [fixture.admin.id]),
    sessions: await countByIds(client, 'user_sessions', 'id', sessionIds),
    userRequests: await countByIds(client, 'user_requests', 'id', userRequestIds),
    userRequestStatusLogs: await countByIds(client, 'user_request_status_logs', 'user_request_id', userRequestIds),
    reports: await countByIds(client, 'reports', 'id', reportIds),
    companionBlocks: await countByIds(client, 'user_companion_blocks', 'companion_id', companionIds),
    adminActionLogs: await countByIds(
      client,
      'admin_action_logs',
      'target_id',
      [...userRequestIds, ...reportIds],
    ),
  };
}

async function countByIds(client, table, column, ids) {
  if (!ids.length) return 0;
  return scalar(
    client,
    `select count(*)::integer as value from ${table} where ${column} = any($1::uuid[])`,
    [ids],
  );
}

function toDatabaseKeys(value) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      item,
    ]),
  );
}

async function scalar(client, sql, params = []) {
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

function sanitizeError(error, rawUrl) {
  let message = error instanceof SafetyRefusalError ? error.message : databaseErrorSummary(error);
  const secrets = [rawUrl];
  try {
    const parsed = rawUrl ? new URL(rawUrl) : null;
    if (parsed?.username) secrets.push(decodeURIComponent(parsed.username));
    if (parsed?.password) secrets.push(decodeURIComponent(parsed.password));
  } catch {
    // Invalid URLs are represented by a fixed refusal message.
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
