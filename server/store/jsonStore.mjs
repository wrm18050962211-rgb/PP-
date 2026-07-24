import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createMemoryPhoneVerificationWrites } from './memoryPhoneVerificationWrites.mjs';

export function createJsonStore({ storePath, initialStore, normalizeStore }) {
  if (!storePath) throw new Error('storePath is required');
  if (typeof initialStore !== 'function') throw new Error('initialStore factory is required');
  if (typeof normalizeStore !== 'function') throw new Error('normalizeStore function is required');

  const phoneVerificationWrites = createMemoryPhoneVerificationWrites();

  return {
    kind: 'json',
    storePath,
    capabilities: {
      readModel: true,
      writes: true,
      transactions: false,
      phoneVerificationWrites: true,
    },
    phoneVerificationWrites,
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
      const persistedStore = { ...store, activeSession: null };
      await writeFile(storePath, JSON.stringify(persistedStore, null, 2), 'utf8');
    },
  };
}
