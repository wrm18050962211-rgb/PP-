import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const HASH_SCHEME = 'scrypt';
const HASH_VERSION = 'v1';
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const SALT_LENGTH = 16;

const ROLE_SCOPES = Object.freeze({
  store_lite_viewer: Object.freeze(['booking_requests:read']),
  store_lite_ops: Object.freeze(['booking_requests:read', 'booking_requests:write']),
  admin: Object.freeze(['booking_requests:read', 'booking_requests:write']),
  super_admin: Object.freeze(['booking_requests:read', 'booking_requests:write']),
});

const DUMMY_PASSWORD_HASH = encodePasswordHash(Buffer.alloc(SALT_LENGTH), Buffer.alloc(SCRYPT_KEY_LENGTH));

export async function hashAdminPassword(password, pepper) {
  assertPepper(pepper);
  const normalizedPassword = requirePassword(password);
  const salt = randomBytes(SALT_LENGTH);
  const digest = await derivePasswordKey(normalizedPassword, pepper, salt);
  return encodePasswordHash(salt, digest);
}

export async function verifyAdminPassword(password, encodedHash, pepper) {
  assertPepper(pepper);
  const passwordValue = typeof password === 'string' ? password : '';
  const parsed = parsePasswordHash(encodedHash);
  const salt = parsed?.salt || Buffer.alloc(SALT_LENGTH);
  const expectedDigest = parsed?.digest || Buffer.alloc(SCRYPT_KEY_LENGTH);
  const actualDigest = await derivePasswordKey(passwordValue, pepper, salt);
  const matches = timingSafeEqual(actualDigest, expectedDigest);
  return Boolean(parsed) && matches;
}

export async function authenticateAdmin(client, { username, password, pepper, previousPepper } = {}) {
  assertClient(client);
  assertPepper(pepper);

  const usernameValue = typeof username === 'string' ? username.trim() : '';
  const passwordValue = typeof password === 'string' ? password : '';
  const result = await client.query(
    `select id, username, password_hash, name, role, status
     from admin_users
     where username = $1
     limit 1`,
    [usernameValue],
  );
  const row = result.rows?.[0] || null;

  const storedHash = row?.password_hash || row?.passwordHash || DUMMY_PASSWORD_HASH;
  const currentPepperMatches = await verifyAdminPassword(passwordValue, storedHash, pepper);
  let previousPepperMatches = false;
  if (isNonEmptyString(previousPepper) && previousPepper !== pepper) {
    previousPepperMatches = await verifyAdminPassword(passwordValue, storedHash, previousPepper);
  }

  if (!row || row.status !== 'active' || (!currentPepperMatches && !previousPepperMatches)) {
    throw invalidCredentials();
  }

  const updateResult = await client.query(
    `update admin_users
     set last_login_at = now(),
         updated_at = now()
     where id = $1
       and status = 'active'
     returning id`,
    [row.id],
  );
  if (!updateResult.rows?.[0]) throw invalidCredentials();

  return {
    id: String(row.id),
    name: String(row.name || ''),
    role: String(row.role || ''),
    scopes: adminScopesForRole(row.role),
  };
}

export function adminScopesForRole(role) {
  return [...(ROLE_SCOPES[String(role || '').trim()] || [])];
}

function encodePasswordHash(salt, digest) {
  return [
    HASH_SCHEME,
    HASH_VERSION,
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    String(SCRYPT_KEY_LENGTH),
    salt.toString('base64url'),
    digest.toString('base64url'),
  ].join('$');
}

function parsePasswordHash(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split('$');
  if (
    parts.length !== 8 ||
    parts[0] !== HASH_SCHEME ||
    parts[1] !== HASH_VERSION ||
    parts[2] !== String(SCRYPT_N) ||
    parts[3] !== String(SCRYPT_R) ||
    parts[4] !== String(SCRYPT_P) ||
    parts[5] !== String(SCRYPT_KEY_LENGTH)
  ) {
    return null;
  }

  const salt = decodeBase64Url(parts[6], SALT_LENGTH);
  const digest = decodeBase64Url(parts[7], SCRYPT_KEY_LENGTH);
  if (!salt || !digest) return null;
  return { salt, digest };
}

function decodeBase64Url(value, expectedLength) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== expectedLength || decoded.toString('base64url') !== value) return null;
  return decoded;
}

async function derivePasswordKey(password, pepper, salt) {
  const passwordMaterial = createHmac('sha256', Buffer.from(pepper, 'utf8'))
    .update('still-admin-password-v1\0', 'utf8')
    .update(password, 'utf8')
    .digest();
  return scryptAsync(passwordMaterial, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEMORY,
  });
}

function assertClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('PostgreSQL client with query(sql, params) is required');
  }
}

function assertPepper(pepper) {
  if (!isNonEmptyString(pepper)) {
    const error = new Error('Admin authentication is not configured');
    error.code = 'ADMIN_AUTH_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }
}

function requirePassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('Password must be a non-empty string');
  }
  return password;
}

function invalidCredentials() {
  const error = new Error('Admin credentials are invalid');
  error.code = 'ADMIN_CREDENTIALS_INVALID';
  error.status = 401;
  return error;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}
