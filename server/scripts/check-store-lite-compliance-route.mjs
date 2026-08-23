import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverSource = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const storeSource = readFileSync(new URL('../store/postgresStore.mjs', import.meta.url), 'utf8');
const contentSource = readFileSync(new URL('../store/postgresContentGateway.mjs', import.meta.url), 'utf8');
const featureSource = readFileSync(new URL('../services/storeLiteFeature.mjs', import.meta.url), 'utf8');

const routeBlock = sourceBetween(serverSource, 'async function route(', 'function shouldUseRequestScopedStore(');
const requestScopeBlock = functionBlock(serverSource, 'shouldUseRequestScopedStore');
const allowlistBlock = functionBlock(serverSource, 'isStoreLiteAllowedRequest');
const readinessBlock = functionBlock(serverSource, 'storeLiteComplianceReadiness');

for (const route of [
  "method === 'POST' && path === '/api/user-requests'",
  "method === 'GET' && path === '/api/user-requests'",
  "method === 'POST' && path === '/api/content-reports'",
  "method === 'GET' && path === '/api/me/content-reports'",
  "method === 'GET' && path === '/api/me/blocked-companions'",
  "method === 'GET' && path === '/api/admin/user-requests'",
  "method === 'GET' && path === '/api/admin/content-reports'",
]) {
  assert(routeBlock.includes(route), `exact route is registered: ${route}`);
}
assert(/\^\\\/api\\\/user-requests\\\/\[\^\/\]\+\$/.test(routeBlock), 'user request detail has one id segment');
assert(/\^\\\/api\\\/user-requests\\\/\[\^\/\]\+\\\/cancel\$/.test(routeBlock), 'user request cancel has one id segment');
assert(/\^\\\/api\\\/me\\\/content-reports\\\/\[\^\/\]\+\$/.test(routeBlock), 'content report detail has one id segment');
assert(/\^\\\/api\\\/me\\\/blocked-companions\\\/\[\^\/\]\+\$/.test(routeBlock), 'block mutations have one companion id segment');
assert(/\^\\\/api\\\/admin\\\/user-requests\\\/\[\^\/\]\+\\\/\(\?:start\|complete\|decline\)\$/.test(routeBlock), 'admin user request actions are explicit');
assert(/\^\\\/api\\\/admin\\\/content-reports\\\/\[\^\/\]\+\\\/\(\?:investigate\|resolve\|reject\)\$/.test(routeBlock), 'admin report actions are explicit');

for (const handler of [
  'createUserRequestRoute',
  'listUserRequestsRoute',
  'getUserRequestRoute',
  'cancelUserRequestRoute',
  'createContentReportRoute',
  'listContentReportsRoute',
  'getContentReportRoute',
  'listBlockedCompanionsRoute',
  'blockCompanionRoute',
  'unblockCompanionRoute',
]) {
  const source = functionBlock(serverSource, handler);
  assert(/requireConsumerSession\(store\)/.test(source), `${handler} requires a consumer session`);
  assert(/userId:\s*gate\.session\.user\.id/.test(source), `${handler} derives its actor from the session`);
  assert(!/body\.userId|searchParams\.get\(['"]userId['"]\)/.test(source), `${handler} rejects caller-owned actor selection`);
}

for (const handler of ['listAdminUserRequestsRoute', 'getAdminUserRequestRoute']) {
  assert(/requireAdminScope\(store, 'user_requests:read'/.test(functionBlock(serverSource, handler)), `${handler} requires user request read scope`);
}
assert(/requireAdminScope\(store, 'user_requests:write'/.test(functionBlock(serverSource, 'transitionAdminUserRequestRoute')), 'user request actions require write scope');
for (const handler of ['listAdminContentReportsRoute', 'getAdminContentReportRoute']) {
  assert(/requireAdminScope\(store, 'content_reports:read'/.test(functionBlock(serverSource, handler)), `${handler} requires content report read scope`);
}
assert(/requireAdminScope\(store, 'content_reports:moderate'/.test(functionBlock(serverSource, 'transitionAdminContentReportRoute')), 'content report actions require moderate scope');

assert(/storeLiteComplianceEnabled/.test(requestScopeBlock), 'compliance request-scoped reads are feature gated');
assert(/dataStore\.capabilities\?\.storeLiteCompliance/.test(requestScopeBlock), 'compliance request-scoped reads require the PostgreSQL gateway');
for (const prefix of ['/api/user-requests', '/api/content-reports', '/api/me/content-reports', '/api/me/blocked-companions', '/api/admin/user-requests', '/api/admin/content-reports']) {
  assert(requestScopeBlock.includes(`path === '${prefix}'`) || requestScopeBlock.includes(`path.startsWith('${prefix}/')`), `${prefix} uses the request-scoped store`);
}
assert(/dataStore\.kind !== 'postgres'[\s\S]*COMPLIANCE_POSTGRES_REQUIRED/.test(readinessBlock), 'non-PostgreSQL compliance routes fail closed');
assert(/!storeLiteComplianceEnabled[\s\S]*404, 'NOT_FOUND'/.test(readinessBlock), 'feature-off compliance routes are indistinguishable from absent routes');
assert(/USER_REQUEST_\|CONTENT_REPORT_\|COMPANION_BLOCK_\|COMPLIANCE_/.test(functionBlock(serverSource, 'storeLiteComplianceGatewayResponse')), 'only stable compliance gateway errors are exposed');

for (const expected of [
  "'POST /api/user-requests'",
  "'GET /api/user-requests'",
  "'POST /api/content-reports'",
  "'GET /api/me/content-reports'",
  "'GET /api/me/blocked-companions'",
  "'GET /api/admin/user-requests'",
  "'GET /api/admin/content-reports'",
]) {
  assert(allowlistBlock.includes(expected), `Store Lite allowlist includes ${expected}`);
}
for (const forbidden of ['/api/reports', '/api/matching/companions', '/api/admin/action-logs', '/api/admin/security-events', '/api/admin/moderation', '/api/admin/audit-cases']) {
  assert(!allowlistBlock.includes(`'${forbidden}'`), `legacy route remains excluded: ${forbidden}`);
}

assert(/storeLiteCompliance:\s*storeLiteComplianceEnabled/.test(storeSource), 'PostgreSQL advertises compliance capability only when enabled');
assert(/\.\.\.\(storeLiteComplianceEnabled[\s\S]*storeLiteCompliance:\s*\{/.test(storeSource), 'compliance gateway is absent while the flag is off');
assert(/userId:\s*storeLiteComplianceEnabled \? options\.userId : null/.test(storeSource), 'content block filtering is disabled safely with the compliance flag');
assert(/if \(!viewerUserId\) return `and \$\{parameter\}::uuid is null`/.test(contentSource), 'flag-off content SQL never references the optional block table');
assert(/from user_companion_blocks ucb/.test(contentSource), 'authenticated content reads enforce persisted block relations');
assert(/STORE_LITE_COMPLIANCE_FLAG = 'ENABLE_STORE_LITE_COMPLIANCE'/.test(featureSource), 'compliance has one explicit feature flag');
assert(/isStoreLiteRelease && !storeLiteComplianceEnabled/.test(functionBlock(serverSource, 'launchCheck')), 'Store Lite launch readiness requires compliance to be enabled');

console.log(JSON.stringify({
  ok: true,
  checks: [
    'exact-compliance-routes',
    'consumer-actor-from-session',
    'admin-scope-from-session',
    'request-scoped-postgres-only',
    'feature-off-not-found',
    'postgres-fail-closed',
    'legacy-routes-excluded',
    'block-filter-feature-boundary',
    'stable-public-errors',
  ],
}, null, 2));

function functionBlock(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${escapeRegExp(name)}\\s*\\(`).exec(source);
  if (!match) throw new Error(`Missing function ${name}`);
  const braceStart = source.indexOf('{', source.indexOf(')', match.index) + 1);
  if (braceStart < 0) throw new Error(`Missing function body ${name}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = braceStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}' && --depth === 0) return source.slice(match.index, index + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Missing source markers: ${startMarker} -> ${endMarker}`);
  return source.slice(start, end);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
