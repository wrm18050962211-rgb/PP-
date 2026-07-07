import { runProviderCallbackRetryJob } from '../jobs/providerCallbackRetryJob.mjs';
import { createPostgresStore } from '../store/postgresStore.mjs';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required to run the provider callback retry job.');
  process.exit(1);
}

const result = await runProviderCallbackRetryJob({
  dataStore: createPostgresStore({ databaseUrl }),
  dueAt: new Date().toISOString(),
  limit: process.env.PROVIDER_CALLBACK_RETRY_JOB_LIMIT || 20,
});

console.log(JSON.stringify(result, null, 2));
