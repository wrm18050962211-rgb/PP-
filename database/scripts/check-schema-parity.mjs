import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sql = await readFile(resolve(root, 'schema.sql'), 'utf8');
const prisma = await readFile(resolve(root, 'prisma/schema.prisma'), 'utf8');

const sqlTables = new Set(
  [...sql.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi)].map((match) => match[1]),
);
const prismaTables = new Set([...prisma.matchAll(/@@map\("([^"]+)"\)/g)].map((match) => match[1]));

const missingInPrisma = [...sqlTables].filter((table) => !prismaTables.has(table)).sort();
const missingInSql = [...prismaTables].filter((table) => !sqlTables.has(table)).sort();

assert(sqlTables.size > 0, 'SQL schema exposes tables');
assert(prismaTables.size > 0, 'Prisma schema exposes mapped models');
assert(missingInPrisma.length === 0, `SQL tables missing Prisma models: ${missingInPrisma.join(', ')}`);
assert(missingInSql.length === 0, `Prisma models missing SQL tables: ${missingInSql.join(', ')}`);

for (const table of [
  'users',
  'admin_users',
  'user_sessions',
  'idempotency_keys',
  'orders',
  'payments',
  'refunds',
  'admin_action_logs',
  'audit_logs',
  'security_events',
]) {
  assert(sqlTables.has(table), `SQL schema includes critical table ${table}`);
  assert(prismaTables.has(table), `Prisma schema includes critical table ${table}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['sql-table-list', 'prisma-model-maps', 'table-parity', 'critical-tables'],
      tableCount: sqlTables.size,
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Schema parity check failed: ${message}`);
}
