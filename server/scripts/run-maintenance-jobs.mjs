import { runMaintenanceJobs } from '../jobs/maintenanceJob.mjs';
import { createPostgresStore } from '../store/postgresStore.mjs';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required to run maintenance jobs.');
  process.exit(1);
}

const result = await runMaintenanceJobs({
  dataStore: createPostgresStore({ databaseUrl }),
  now: new Date().toISOString(),
  paymentExpiryLimit: process.env.PAYMENT_EXPIRY_JOB_LIMIT || 100,
  mediaExpiryLimit: process.env.MEDIA_EXPIRY_JOB_LIMIT || 100,
  providerCallbackLimit: process.env.PROVIDER_CALLBACK_RETRY_JOB_LIMIT || 20,
});

console.log(JSON.stringify(result, null, 2));
