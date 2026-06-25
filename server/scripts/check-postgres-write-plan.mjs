import { getPostgresWriteOperation, postgresWriteOperations } from '../store/postgresWritePlan.mjs';

const requiredOperations = ['createOrder', 'markPaymentPaid', 'transitionOrder', 'sendMessage', 'createReport', 'applyModerationAction'];
const requiredTables = [
  'orders',
  'order_status_logs',
  'payments',
  'availability_slots',
  'conversations',
  'messages',
  'message_risk_events',
  'reports',
  'audit_cases',
  'admin_action_logs',
];

for (const name of requiredOperations) {
  const operation = getPostgresWriteOperation(name);
  assert(operation, `${name} operation is documented`);
  assert(operation.transaction === true, `${name} must run inside a transaction`);
  assert(operation.tables.length > 0, `${name} lists touched tables`);
  assert(operation.steps.length > 0, `${name} lists migration steps`);
}

const coveredTables = new Set(postgresWriteOperations.flatMap((operation) => operation.tables));
for (const table of requiredTables) {
  assert(coveredTables.has(table), `${table} is covered by at least one write operation`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      operations: postgresWriteOperations.map((operation) => operation.name),
      tableCount: coveredTables.size,
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres write plan check failed: ${message}`);
}
