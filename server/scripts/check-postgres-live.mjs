import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        skipped: true,
        reason: 'DATABASE_URL is not set.',
        checks: ['database-url-optional'],
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const requiredTables = [
  'users',
  'user_sessions',
  'admin_users',
  'admin_action_logs',
  'audit_logs',
  'security_events',
  'idempotency_keys',
  'orders',
  'payments',
  'provider_callback_events',
  'availability_slots',
  'order_status_logs',
  'messages',
  'message_risk_events',
  'reports',
  'audit_cases',
  'refunds',
  'settlements',
  'ledger_entries',
];

const healthRow = psqlRows(`select current_database() || '|' || current_schema()`)[0] || '';
const [databaseName, schemaName] = healthRow.split('|');

const existingTables = new Set(
  psqlRows(
    `select table_name
     from information_schema.tables
     where table_schema = 'public'
       and table_name in (${sqlStringList(requiredTables)})`,
  ),
);
const missingTables = requiredTables.filter((table) => !existingTables.has(table));
assert(missingTables.length === 0, `missing tables: ${missingTables.join(', ')}`);

const idempotencyColumns = psqlRows(
  `select column_name
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'idempotency_keys'
     and column_name in (${sqlStringList(['scope', 'request_key', 'actor_type', 'actor_key', 'status', 'locked_until', 'response_body'])})`,
);
assert(idempotencyColumns.length === 7, 'idempotency_keys has required columns');

const providerCallbackColumns = psqlRows(
  `select column_name
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'provider_callback_events'
     and column_name in (${sqlStringList(['provider', 'event_type', 'provider_event_id', 'status', 'retry_count', 'next_retry_at', 'raw_payload'])})`,
);
assert(providerCallbackColumns.length === 7, 'provider_callback_events has required queue columns');

psqlRows(`
  begin;
  select id from availability_slots order by start_at limit 0 for update skip locked;
  select id
  from provider_callback_events
  where status = 'retrying'
  order by coalesce(next_retry_at, created_at), created_at
  limit 0
  for update skip locked;
  rollback;
`);

console.log(
  JSON.stringify(
    {
      ok: true,
      database: { database_name: databaseName, schema_name: schemaName },
      checks: ['connect', 'required-tables', 'idempotency-columns', 'provider-callback-columns', 'slot-lock-syntax', 'provider-callback-lock-syntax'],
    },
    null,
    2,
  ),
);

function psqlRows(sql) {
  const result = spawnSync('psql', [databaseUrl, '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', sql], {
    encoding: 'utf8',
  });
  if (result.error) {
    throw new Error(`Unable to run psql. Install PostgreSQL client tools before running live checks. Original error: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`psql failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function sqlStringList(values) {
  return values.map((value) => `'${String(value).replace(/'/g, "''")}'`).join(', ');
}

function assert(condition, message) {
  if (!condition) throw new Error(`Live PostgreSQL check failed: ${message}`);
}
