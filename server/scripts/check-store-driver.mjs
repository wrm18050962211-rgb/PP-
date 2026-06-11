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

  console.log(JSON.stringify({ ok: true, checks: ['default-json', 'postgres-requires-database-url', 'postgres-selectable'] }, null, 2));
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
