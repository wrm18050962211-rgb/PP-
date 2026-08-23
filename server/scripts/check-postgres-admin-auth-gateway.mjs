import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  authenticateAdmin,
  hashAdminPassword,
  verifyAdminPassword,
} from '../store/postgresAdminAuth.mjs';

const pepper = 'admin-auth-check-current-pepper';
const previousPepper = 'admin-auth-check-previous-pepper';
const password = 'Correct horse battery staple 2026!';
const adminId = '00000000-0000-4000-8000-000000000901';

const firstHash = await hashAdminPassword(password, pepper);
const secondHash = await hashAdminPassword(password, pepper);
const firstParts = firstHash.split('$');
const secondParts = secondHash.split('$');

assert.equal(firstParts.length, 8, 'password hash has a fixed field count');
assert.deepEqual(firstParts.slice(0, 6), ['scrypt', 'v1', '16384', '8', '1', '32'], 'password hash records its version and scrypt parameters');
assert.match(firstParts[6], /^[A-Za-z0-9_-]+$/, 'salt is base64url encoded');
assert.match(firstParts[7], /^[A-Za-z0-9_-]+$/, 'digest is base64url encoded');
assert.notEqual(firstParts[6], secondParts[6], 'each password hash uses an independent random salt');
assert.notEqual(firstHash, secondHash, 'the same password never produces the same stored hash');
assert.equal(await verifyAdminPassword(password, firstHash, pepper), true, 'correct password and pepper verify');
assert.equal(await verifyAdminPassword('wrong password', firstHash, pepper), false, 'wrong password is rejected');
assert.equal(await verifyAdminPassword(password, firstHash, previousPepper), false, 'wrong pepper is rejected');
assert.equal(await verifyAdminPassword(password, 'pbkdf2$v1$invalid', pepper), false, 'unknown or malformed formats fail closed');
assert.equal(await verifyAdminPassword(password, `${firstHash.slice(0, -1)}!`, pepper), false, 'invalid encoded digests fail closed');
await assert.rejects(() => hashAdminPassword('', pepper), TypeError, 'empty passwords are not hashable');

const activeRow = {
  id: adminId,
  username: 'store-lite-ops',
  password_hash: firstHash,
  name: 'Store Lite Ops',
  role: 'store_lite_ops',
  status: 'active',
};
const successClient = createMockClient(activeRow);
const authenticated = await authenticateAdmin(successClient, {
  username: '  store-lite-ops  ',
  password,
  pepper,
});

assert.deepEqual(
  authenticated,
  {
    id: adminId,
    name: 'Store Lite Ops',
    role: 'store_lite_ops',
    scopes: [
      'booking_requests:read',
      'booking_requests:write',
      'user_requests:read',
      'user_requests:write',
      'content_reports:read',
      'content_reports:moderate',
    ],
  },
  'successful authentication returns only the admin identity and mapped Store Lite scopes',
);
assert.deepEqual(Object.keys(authenticated).sort(), ['id', 'name', 'role', 'scopes'], 'successful response has an exact public field whitelist');
assert(!/password|hash|username|status|lastLogin/i.test(JSON.stringify(authenticated)), 'successful response contains no credential or internal status field');
assert.match(successClient.calls[0].sql, /^select id, username, password_hash, name, role, status from admin_users/i, 'admin lookup selects only required columns');
assert(!/select \*/i.test(successClient.calls[0].sql), 'admin lookup never selects every database column');
assert.deepEqual(successClient.calls[0].params, ['store-lite-ops'], 'username is normalized and parameterized');
assert.match(successClient.calls[1].sql, /update admin_users set last_login_at = now\(\), updated_at = now\(\)/i, 'successful login updates last_login_at');
assert.match(successClient.calls[1].sql, /where id = \$1 and status = 'active'/i, 'last-login update rechecks active status');
assert.deepEqual(successClient.calls[1].params, [adminId], 'last-login update is parameterized by admin id');
assert.equal(
  successClient.calls.flatMap((call) => call.params).some((value) => [password, pepper, firstHash].includes(value)),
  false,
  'passwords, peppers, and stored hashes are never sent back to PostgreSQL as authentication parameters',
);

const roleExpectations = new Map([
  ['store_lite_viewer', ['booking_requests:read', 'user_requests:read', 'content_reports:read']],
  ['store_lite_ops', ['booking_requests:read', 'booking_requests:write', 'user_requests:read', 'user_requests:write', 'content_reports:read', 'content_reports:moderate']],
  ['admin', ['booking_requests:read', 'booking_requests:write', 'user_requests:read', 'user_requests:write', 'content_reports:read', 'content_reports:moderate']],
  ['super_admin', ['booking_requests:read', 'booking_requests:write', 'user_requests:read', 'user_requests:write', 'content_reports:read', 'content_reports:moderate']],
  ['unknown_role', []],
]);
for (const [role, expectedScopes] of roleExpectations) {
  const roleClient = createMockClient({ ...activeRow, role });
  const roleAdmin = await authenticateAdmin(roleClient, { username: activeRow.username, password, pepper });
  assert.deepEqual(roleAdmin.scopes, expectedScopes, `${role} receives only its explicit booking-request scopes`);
  assert.equal(roleAdmin.scopes.some((scope) => /finance|payment|refund|settlement/i.test(scope)), false, `${role} receives no invented financial scope`);
}

const previousHash = await hashAdminPassword(password, previousPepper);
const rotatedClient = createMockClient({ ...activeRow, password_hash: previousHash });
const rotatedAdmin = await authenticateAdmin(rotatedClient, {
  username: activeRow.username,
  password,
  pepper,
  previousPepper,
});
assert.equal(rotatedAdmin.id, adminId, 'previous pepper remains valid during a controlled rotation window');
assert.equal(rotatedClient.calls.length, 2, 'pepper rotation still performs one lookup and one last-login update');

const missingClient = createMockClient(null);
const missingError = await captureError(() =>
  authenticateAdmin(missingClient, { username: 'does-not-exist', password: 'guessed password', pepper }),
);
assert.equal(missingClient.calls.length, 1, 'unknown usernames never reach the success update');

const wrongPasswordClient = createMockClient(activeRow);
const wrongPasswordError = await captureError(() =>
  authenticateAdmin(wrongPasswordClient, { username: activeRow.username, password: 'wrong password', pepper }),
);
assert.equal(wrongPasswordClient.calls.length, 1, 'wrong passwords never update last_login_at');

const inactiveClient = createMockClient({ ...activeRow, status: 'disabled' });
const inactiveError = await captureError(() =>
  authenticateAdmin(inactiveClient, { username: activeRow.username, password, pepper }),
);
assert.equal(inactiveClient.calls.length, 1, 'inactive admins never update last_login_at');

for (const authError of [missingError, wrongPasswordError, inactiveError]) {
  assert.equal(authError.code, 'ADMIN_CREDENTIALS_INVALID', 'credential failures share one external code');
  assert.equal(authError.status, 401, 'credential failures share one external status');
  assert.equal(authError.message, 'Admin credentials are invalid', 'credential failures share one external message');
  assert.equal(authError.message.includes(activeRow.username), false, 'credential errors never disclose a username');
}

const malformedClient = createMockClient({ ...activeRow, password_hash: 'not-a-supported-hash' });
const malformedError = await captureError(() =>
  authenticateAdmin(malformedClient, { username: activeRow.username, password, pepper }),
);
assert.equal(malformedError.code, 'ADMIN_CREDENTIALS_INVALID', 'malformed stored hashes fail as invalid credentials');
assert.equal(malformedClient.calls.length, 1, 'malformed stored hashes never update last_login_at');

const raceClient = createMockClient(activeRow, { updateSucceeds: false });
const raceError = await captureError(() =>
  authenticateAdmin(raceClient, { username: activeRow.username, password, pepper }),
);
assert.equal(raceError.code, 'ADMIN_CREDENTIALS_INVALID', 'an admin disabled between lookup and update fails as invalid credentials');
assert.equal(raceClient.calls.length, 2, 'active-status race is detected by the conditional update');

const unconfiguredClient = createMockClient(activeRow, { rejectAnyQuery: true });
const unconfiguredError = await captureError(() =>
  authenticateAdmin(unconfiguredClient, { username: activeRow.username, password, pepper: '' }),
);
assert.equal(unconfiguredError.code, 'ADMIN_AUTH_NOT_CONFIGURED', 'missing pepper fails with a stable configuration error');
assert.equal(unconfiguredError.status, 503, 'missing pepper safely disables admin authentication');
assert.equal(unconfiguredClient.calls.length, 0, 'missing pepper fails before querying credentials');

const source = readFileSync(new URL('../store/postgresAdminAuth.mjs', import.meta.url), 'utf8');
assert(/promisify\(scrypt\)/.test(source), 'password hashing uses asynchronous Node crypto scrypt');
assert(/randomBytes\(SALT_LENGTH\)/.test(source), 'password hashing generates a fresh salt');
assert(/timingSafeEqual\(actualDigest, expectedDigest\)/.test(source), 'password verification uses timingSafeEqual');
assert(/row\?\.password_hash[\s\S]*DUMMY_PASSWORD_HASH/.test(source), 'missing usernames select a valid dummy hash');
assert(/verifyAdminPassword\(passwordValue, storedHash, pepper\)/.test(source), 'the dummy hash follows the same scrypt verification path');
assert.equal(/DATABASE_URL|connectionString|console\./.test(source), false, 'gateway neither reads a DSN nor logs credentials or secrets');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'versioned-async-scrypt-format',
        'independent-random-salt',
        'timing-safe-verification',
        'current-and-previous-pepper',
        'dummy-scrypt-username-enumeration-boundary',
        'uniform-invalid-credential-response',
        'inactive-admin-rejected',
        'conditional-last-login-update',
      'explicit-store-lite-scope-map',
        'public-admin-field-whitelist',
        'missing-pepper-fail-closed',
        'no-dsn-or-secret-logging',
      ],
    },
    null,
    2,
  ),
);

function createMockClient(row, options = {}) {
  return {
    calls: [],
    async query(sql, params = []) {
      const normalized = String(sql).trim().replace(/\s+/g, ' ');
      this.calls.push({ sql: normalized, params });
      if (options.rejectAnyQuery) throw new Error('query must not be called');
      if (/^select /i.test(normalized)) return { rows: row ? [{ ...row }] : [] };
      if (/^update admin_users/i.test(normalized)) {
        return { rows: options.updateSucceeds === false ? [] : [{ id: row?.id }] };
      }
      throw new Error(`Unexpected admin auth query: ${normalized}`);
    },
  };
}

async function captureError(callback) {
  try {
    await callback();
  } catch (error) {
    return error;
  }
  throw new Error('Expected admin authentication to reject');
}
