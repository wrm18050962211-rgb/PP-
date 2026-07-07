import { runPendingPaymentExpiryJob } from '../jobs/paymentExpiryJob.mjs';
import { createPostgresStore } from '../store/postgresStore.mjs';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required to run the pending payment expiry job.');
  process.exit(1);
}

const result = await runPendingPaymentExpiryJob({
  dataStore: createPostgresStore({ databaseUrl }),
  occurredAt: new Date().toISOString(),
  reason: process.env.PAYMENT_EXPIRY_JOB_REASON || 'Payment window expired',
  limit: process.env.PAYMENT_EXPIRY_JOB_LIMIT || 100,
});

console.log(JSON.stringify(result, null, 2));
