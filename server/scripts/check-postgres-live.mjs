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

const { Pool } = await importPg();
const pool = new Pool({ connectionString: databaseUrl });

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

try {
  const health = await pool.query('select current_database() as database_name, current_schema() as schema_name');
  const tableResult = await pool.query(
    `select table_name
     from information_schema.tables
     where table_schema = 'public'
       and table_name = any($1::text[])`,
    [requiredTables],
  );
  const existingTables = new Set(tableResult.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((table) => !existingTables.has(table));
  assert(missingTables.length === 0, `missing tables: ${missingTables.join(', ')}`);

  const idempotencyColumns = await pool.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'idempotency_keys'
       and column_name = any($1::text[])`,
    [['scope', 'request_key', 'actor_type', 'actor_key', 'status', 'locked_until', 'response_body']],
  );
  assert(idempotencyColumns.rows.length === 7, 'idempotency_keys has required columns');

  const providerCallbackColumns = await pool.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'provider_callback_events'
       and column_name = any($1::text[])`,
    [['provider', 'event_type', 'provider_event_id', 'status', 'retry_count', 'next_retry_at', 'raw_payload']],
  );
  assert(providerCallbackColumns.rows.length === 7, 'provider_callback_events has required queue columns');

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select id from availability_slots order by start_at limit 0 for update skip locked');
    await client.query(
      `select id
       from provider_callback_events
       where status = 'retrying'
       order by coalesce(next_retry_at, created_at), created_at
       limit 0
       for update skip locked`,
    );
    await client.query('rollback');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        database: health.rows[0],
        checks: ['connect', 'required-tables', 'idempotency-columns', 'provider-callback-columns', 'slot-lock-syntax', 'provider-callback-lock-syntax'],
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}

async function importPg() {
  try {
    return await import('pg');
  } catch (error) {
    throw new Error(`Install the "pg" package before running live PostgreSQL checks. Original error: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`Live PostgreSQL check failed: ${message}`);
}
