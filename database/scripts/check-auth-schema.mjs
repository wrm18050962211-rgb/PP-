import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sql = await readFile(resolve(root, 'schema.sql'), 'utf8');
const prisma = await readFile(resolve(root, 'prisma/schema.prisma'), 'utf8');

assert(/phone varchar\(32\) unique/i.test(sql), 'SQL users.phone is nullable unique');
assert(/create table user_auth_identities/i.test(sql), 'SQL defines user_auth_identities');
assert(/unique\(provider, provider_user_id\)/i.test(sql), 'SQL identity provider id is unique');
assert(/phone\s+String\?\s+@unique/.test(prisma), 'Prisma users.phone is nullable unique');
assert(/model UserAuthIdentity/.test(prisma), 'Prisma defines UserAuthIdentity');
assert(/@@unique\(\[provider, providerUserId\]\)/.test(prisma), 'Prisma identity provider id is unique');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['nullable-phone', 'sql-user-auth-identities', 'prisma-user-auth-identities', 'provider-identity-unique'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Auth schema check failed: ${message}`);
}
