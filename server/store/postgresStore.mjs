export function createPostgresStore({ databaseUrl }) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required when STORE_DRIVER=postgres');
  }

  return {
    kind: 'postgres',
    async load() {
      throw new Error('PostgreSQL store is not implemented yet. Keep STORE_DRIVER=json for local MVP, or implement server/store/postgresStore.mjs before switching.');
    },
    async save() {
      throw new Error('PostgreSQL store is not implemented yet. Keep STORE_DRIVER=json for local MVP, or implement server/store/postgresStore.mjs before switching.');
    },
  };
}
