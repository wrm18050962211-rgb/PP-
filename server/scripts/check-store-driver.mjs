import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createDataStore } from '../store/index.mjs';

const tempDir = await mkdtemp(resolve(tmpdir(), 'pp-store-driver-'));

try {
  process.env.STORE_DRIVER = '';
  delete process.env.DATABASE_URL;
  const jsonStore = createDataStore({
    storePath: resolve(tempDir, 'store.json'),
    initialStore: () => ({ meta: { version: 1 } }),
    normalizeStore: (store) => ({ store, changed: false }),
  });
  assert(jsonStore.kind === 'json', 'default store driver is json');
  assert(jsonStore.capabilities?.writes === true, 'json store advertises writes');

  process.env.STORE_DRIVER = 'postgres';
  delete process.env.DATABASE_URL;
  assertThrows(
    () =>
      createDataStore({
        storePath: resolve(tempDir, 'store.json'),
        initialStore: () => ({ meta: { version: 1 } }),
        normalizeStore: (store) => ({ store, changed: false }),
      }),
    'DATABASE_URL is required',
    'postgres driver requires DATABASE_URL',
  );

  process.env.DATABASE_URL = 'postgres://user:pass@127.0.0.1:5432/pp';
  const postgresStore = createDataStore({
    storePath: resolve(tempDir, 'store.json'),
    initialStore: () => ({ meta: { version: 1 } }),
    normalizeStore: (store) => ({ store, changed: false }),
  });
  assert(postgresStore.kind === 'postgres', 'postgres driver can be selected when DATABASE_URL exists');
  assert(postgresStore.capabilities?.readModel === true && postgresStore.capabilities?.writes === false, 'postgres store advertises read-only MVP state');
  assert(postgresStore.capabilities?.authWrites === true && typeof postgresStore.authWrites?.upsertIdentityUser === 'function', 'postgres store exposes auth write gateway');
  assert(postgresStore.capabilities?.auditWrites === true && typeof postgresStore.auditWrites?.recordAdminAction === 'function', 'postgres store exposes audit write gateway');
  assert(postgresStore.capabilities?.securityWrites === true && typeof postgresStore.securityWrites?.recordSecurityEvent === 'function', 'postgres store exposes security write gateway');
  assert(postgresStore.capabilities?.sessionWrites === true && typeof postgresStore.sessionWrites?.create === 'function', 'postgres store exposes session write gateway');
  assert(
    postgresStore.capabilities?.idempotencyWrites === true &&
      typeof postgresStore.idempotencyWrites?.findRequest === 'function' &&
      typeof postgresStore.idempotencyWrites?.beginRequest === 'function',
    'postgres store exposes idempotency write gateway',
  );
  assert(
    postgresStore.capabilities?.orderWrites === true &&
      typeof postgresStore.orderWrites?.createOrder === 'function' &&
      typeof postgresStore.orderWrites?.setAdminOrderStatus === 'function',
    'postgres store exposes order write gateway',
  );
  assert(postgresStore.capabilities?.messageWrites === true && typeof postgresStore.messageWrites?.sendMessage === 'function', 'postgres store exposes message write gateway');
  assert(
    postgresStore.capabilities?.moderationWrites === true &&
      typeof postgresStore.moderationWrites?.createReport === 'function' &&
      typeof postgresStore.moderationWrites?.reviewAuditCase === 'function',
    'postgres store exposes moderation write gateway',
  );
  await assertRejects(
    () => postgresStore.save({}),
    'save is not implemented',
    'postgres save remains protected until write DAO exists',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          'default-json',
          'postgres-requires-database-url',
          'postgres-selectable',
          'postgres-auth-gateway',
          'postgres-audit-gateway',
          'postgres-security-gateway',
          'postgres-session-gateway',
          'postgres-idempotency-gateway',
          'postgres-order-gateway',
          'postgres-message-gateway',
          'postgres-moderation-gateway',
          'postgres-save-protected',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  delete process.env.STORE_DRIVER;
  delete process.env.DATABASE_URL;
  await rm(tempDir, { recursive: true, force: true });
}

function assert(condition, message) {
  if (!condition) throw new Error(`Store driver check failed: ${message}`);
}

function assertThrows(fn, messagePart, label) {
  try {
    fn();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(messagePart), label);
    return;
  }
  throw new Error(`Store driver check failed: ${label}`);
}

async function assertRejects(fn, messagePart, label) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(messagePart), label);
    return;
  }
  throw new Error(`Store driver check failed: ${label}`);
}
