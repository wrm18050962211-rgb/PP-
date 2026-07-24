import {
  issuePhoneVerificationChallengeTransaction,
  markPhoneVerificationSentTransaction,
  verifyPhoneVerificationChallengeTransaction,
} from '../store/postgresPhoneVerificationWrites.mjs';

const challenge = {
  id: '00000000-0000-4000-8000-000000000a01',
  phone: '13800138000',
  purpose: 'auth',
  codeHash: 'hash-123456',
  requestedIp: '127.0.0.1',
  provider: 'tencent',
  maxAttempts: 5,
  expiresAt: '2026-07-24T08:05:00.000Z',
  createdAt: '2026-07-24T08:00:00.000Z',
  cooldownSeconds: 60,
  phoneHourlyLimit: 5,
  ipHourlyLimit: 20,
};

const issueClient = createIssueClient();
await issuePhoneVerificationChallengeTransaction(issueClient, challenge);
assert(issueClient.calls[0].sql === 'begin', 'issue transaction begins');
assert(issueClient.calls.some((call) => /pg_advisory_xact_lock/i.test(call.sql)), 'issue transaction locks phone and purpose');
const insertCall = issueClient.calls.find((call) => /insert into phone_verification_challenges/i.test(call.sql));
assert(insertCall, 'challenge is inserted');
assert(insertCall.params.includes('hash-123456'), 'only the code hash is stored');
assert(!insertCall.params.includes('123456'), 'raw code is never stored');
assert(issueClient.calls.at(-1).sql === 'commit', 'issue transaction commits');

const sentClient = createUpdateClient();
await markPhoneVerificationSentTransaction(sentClient, {
  challengeId: challenge.id,
  providerRequestId: 'request-1',
  sentAt: '2026-07-24T08:00:01.000Z',
});
assert(sentClient.calls.some((call) => /delivery_status = \$2/i.test(call.sql)), 'delivery status is updated');

const verifyClient = createVerifyClient();
const verified = await verifyPhoneVerificationChallengeTransaction(verifyClient, {
  phone: challenge.phone,
  purpose: challenge.purpose,
  codeHash: challenge.codeHash,
  verifiedAt: '2026-07-24T08:01:00.000Z',
});
assert(verified.status === 'verified', 'matching hash verifies');
assert(verifyClient.calls.some((call) => /for update/i.test(call.sql)), 'verification locks the challenge');
assert(verifyClient.calls.some((call) => /set consumed_at/i.test(call.sql)), 'verification consumes the challenge');
assert(verifyClient.calls.at(-1).sql === 'commit', 'verification transaction commits');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['transaction-lock', 'hash-only-storage', 'delivery-status', 'consume-on-verify'],
    },
    null,
    2,
  ),
);

function createIssueClient() {
  return {
    calls: [],
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      this.calls.push({ sql: normalized, params });
      if (/select created_at from phone_verification_challenges/i.test(normalized)) return { rows: [] };
      if (/count\(\*\) filter/i.test(normalized)) return { rows: [{ phone_count: 0, ip_count: 0 }] };
      if (/insert into phone_verification_challenges/i.test(normalized)) return { rows: [{ id: challenge.id }] };
      return { rows: [] };
    },
  };
}

function createUpdateClient() {
  return {
    calls: [],
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      this.calls.push({ sql: normalized, params });
      return { rows: [{ id: challenge.id }] };
    },
  };
}

function createVerifyClient() {
  return {
    calls: [],
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      this.calls.push({ sql: normalized, params });
      if (/select id, code_hash/i.test(normalized)) {
        return {
          rows: [
            {
              id: challenge.id,
              code_hash: challenge.codeHash,
              attempts: 0,
              max_attempts: 5,
              expires_at: challenge.expiresAt,
              consumed_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres phone verification write check failed: ${message}`);
}
