import { runPendingMediaExpiryJob } from '../jobs/mediaExpiryJob.mjs';
import { createPostgresStore } from '../store/postgresStore.mjs';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required to expire pending media uploads.');
  process.exit(1);
}

const result = await runPendingMediaExpiryJob({
  dataStore: createPostgresStore({ databaseUrl }),
  occurredAt: new Date().toISOString(),
  limit: process.env.MEDIA_EXPIRY_JOB_LIMIT || 100,
});

console.log(JSON.stringify(result, null, 2));
