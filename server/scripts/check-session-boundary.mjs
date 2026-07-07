import { readFile } from 'node:fs/promises';

const serverSource = await readFile('server.mjs', 'utf8');
const jsonStoreSource = await readFile('store/jsonStore.mjs', 'utf8');

assert(
  serverSource.includes('next.activeSession = null;'),
  'normalizeStore must not restore persisted activeSession',
);
assert(
  jsonStoreSource.includes('const persistedStore = { ...store, activeSession: null };'),
  'jsonStore.save must not persist activeSession',
);

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['normalize-clears-active-session', 'json-save-clears-active-session'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Session boundary check failed: ${message}`);
}
