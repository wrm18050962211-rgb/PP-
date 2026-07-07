import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sql = await readFile(resolve(root, 'schema.sql'), 'utf8');
const prisma = await readFile(resolve(root, 'prisma/schema.prisma'), 'utf8');

assert(/create table idempotency_keys/i.test(sql), 'SQL defines idempotency_keys');
assert(/unique\(scope, request_key, actor_type, actor_key\)/i.test(sql), 'SQL has actor-scoped idempotency uniqueness');
assert(/idx_idempotency_keys_processing/i.test(sql), 'SQL has processing lock index');
assert(/model IdempotencyKey/.test(prisma), 'Prisma defines IdempotencyKey');
assert(/@@unique\(\[scope, requestKey, actorType, actorKey\]\)/.test(prisma), 'Prisma has actor-scoped idempotency uniqueness');
assert(/@@map\("idempotency_keys"\)/.test(prisma), 'Prisma maps idempotency table');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['sql-idempotency-keys', 'sql-idempotency-unique', 'sql-processing-index', 'prisma-idempotency-model'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Idempotency schema check failed: ${message}`);
}
