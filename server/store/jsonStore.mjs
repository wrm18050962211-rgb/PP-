import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function createJsonStore({ storePath, initialStore, normalizeStore }) {
  if (!storePath) throw new Error('storePath is required');
  if (typeof initialStore !== 'function') throw new Error('initialStore factory is required');
  if (typeof normalizeStore !== 'function') throw new Error('normalizeStore function is required');

  return {
    kind: 'json',
    storePath,
    capabilities: {
      readModel: true,
      writes: true,
      transactions: false,
    },
    async load() {
      let store;
      try {
        store = JSON.parse(await readFile(storePath, 'utf8'));
      } catch {
        store = initialStore();
      }
      return normalizeStore(store);
    },
    async save(store) {
      await mkdir(dirname(storePath), { recursive: true });
      await writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
    },
  };
}
