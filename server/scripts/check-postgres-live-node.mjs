import pg from 'pg';

const { Client } = pg;

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

const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
  query_timeout: 5000,
  statement_timeout: 5000,
});
let connected = false;
let inTransaction = false;

try {
  await client.connect();
  connected = true;

  const health = await client.query(`select current_database() as database_name, current_schema() as schema_name`);
  const existingTables = new Set(
    (
      await client.query(
        `select table_name
         from information_schema.tables
         where table_schema = 'public'
           and table_name = any($1::text[])`,
        [requiredTables],
      )
    ).rows.map((row) => row.table_name),
  );

  const missingTables = requiredTables.filter((table) => !existingTables.has(table));
  assert(missingTables.length === 0, `missing tables: ${missingTables.join(', ')}`);

  await checkColumns('idempotency_keys', ['scope', 'request_key', 'actor_type', 'actor_key', 'status', 'locked_until', 'response_body']);
  await checkColumns('provider_callback_events', ['provider', 'event_type', 'provider_event_id', 'status', 'retry_count', 'next_retry_at', 'raw_payload']);
  await checkColumns('user_sessions', ['token_hash', 'session_scope', 'user_id', 'admin_id', 'companion_id', 'role', 'metadata', 'expires_at', 'revoked_at']);
  await checkColumns('audit_logs', ['audit_case_id', 'action', 'operator_id', 'operator_type', 'comment', 'metadata']);
  await checkColumns('admin_action_logs', ['admin_id', 'action', 'target_type', 'target_id', 'before_data', 'after_data']);
  await checkColumns('security_events', ['event_type', 'actor_id', 'actor_role', 'target_type', 'target_id', 'target_key', 'required_role', 'actual_role', 'metadata']);

  await client.query('begin');
  inTransaction = true;
  await client.query('select id from availability_slots order by start_at limit 0 for update skip locked');
  await client.query(`
    select id
    from provider_callback_events
    where status = 'retrying'
    order by coalesce(next_retry_at, created_at), created_at
    limit 0
    for update skip locked
  `);
  await client.query('rollback');
  inTransaction = false;

  console.log(
    JSON.stringify(
      {
        ok: true,
        database: health.rows[0],
        checks: [
          'connect',
          'required-tables',
          'idempotency-columns',
          'provider-callback-columns',
          'session-columns',
          'audit-log-columns',
          'admin-action-columns',
          'security-event-columns',
          'slot-lock-syntax',
          'provider-callback-lock-syntax',
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (connected && inTransaction) {
    await client.query('rollback').catch(() => {});
  }
  throw error;
} finally {
  if (connected) {
    await client.end().catch(() => {});
  }
}

async function checkColumns(tableName, columns) {
  const rows = await client.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'public'
       and table_name = $1
       and column_name = any($2::text[])`,
    [tableName, columns],
  );
  assert(rows.rowCount === columns.length, `${tableName} has required columns`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Live PostgreSQL check failed: ${message}`);
}
