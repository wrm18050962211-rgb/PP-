import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

const guardedHandlers = [
  'adminLogout',
  'adminDashboard',
  'adminOrders',
  'setAdminOrderStatus',
  'adminActionLogs',
  'adminSecurityEvents',
  'adminModeration',
  'listAuditCases',
  'reviewAuditCase',
  'applyModerationAction',
];

assert(/path === '\/api\/admin\/auth\/login'\) return adminLogin/.test(source), 'admin login remains the only public admin auth entry');

for (const handler of guardedHandlers) {
  const body = functionSource(handler);
  assert(body, `${handler} exists`);
  assert(body.includes('requireAdminSession(store)'), `${handler} requires admin session`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['admin-login-entry', 'admin-handlers-require-session'],
      guardedHandlers,
    },
    null,
    2,
  ),
);

function functionSource(name) {
  const marker = new RegExp(`\\n(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  if (!marker) return '';

  const nextFunction = /\n(?:async\s+)?function\s+\w+\s*\(/g;
  nextFunction.lastIndex = marker.index + 1;
  const next = nextFunction.exec(source);
  return source.slice(marker.index, next?.index ?? source.length);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Admin route boundary check failed: ${message}`);
}
