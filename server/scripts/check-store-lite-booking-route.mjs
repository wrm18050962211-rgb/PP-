import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverSource = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const securitySource = readFileSync(new URL('../security/requestSecurity.mjs', import.meta.url), 'utf8');
const postgresStoreSource = readFileSync(new URL('../store/postgresStore.mjs', import.meta.url), 'utf8');
const featureSource = readFileSync(new URL('../services/storeLiteFeature.mjs', import.meta.url), 'utf8');

const routeBlock = sourceBetween(serverSource, 'async function route(', 'function shouldUseRequestScopedStore(');
const requestScopeBlock = sourceBetween(serverSource, 'function shouldUseRequestScopedStore(', 'function createRequestScopedStore(');
const storeLiteAllowlistBlock = functionBlock(serverSource, 'isStoreLiteAllowedRequest');
const bookingBlock = sourceBetween(serverSource, 'async function createBookingRequestRoute(', 'async function listOrders(');
const bookingValidationBlock = sourceBetween(
  securitySource,
  "} else if (route === 'POST /api/booking-requests') {",
  'export function validateRouteQuery(',
);

assert(/method === 'POST' && path === '\/api\/booking-requests'/.test(routeBlock), 'consumer create route is exact');
assert(/method === 'GET' && path === '\/api\/booking-requests'/.test(routeBlock), 'consumer list route is exact');
assert(/method === 'GET' && \/\^\\\/api\\\/booking-requests\\\/\[\^\/\]\+\$\//.test(routeBlock), 'consumer detail route has exactly one id segment');
assert(/method === 'GET' && path === '\/api\/admin\/booking-requests'/.test(routeBlock), 'admin list route is exact');
assert(/method === 'GET' && \/\^\\\/api\\\/admin\\\/booking-requests\\\/\[\^\/\]\+\$\//.test(routeBlock), 'admin detail route has exactly one id segment');

for (const handler of [
  'createBookingRequestRoute',
  'listBookingRequestsRoute',
  'getBookingRequestRoute',
  'cancelBookingRequestRoute',
]) {
  const body = functionBlock(serverSource, handler);
  assert(/requireConsumerSession\(store\)/.test(body), `${handler} requires an authenticated consumer session`);
  assert(!/body\.userId|searchParams\.get\(['"]userId['"]\)/.test(body), `${handler} never accepts a caller-supplied user actor`);
  assert(/userId:\s*gate\.session\.user\.id/.test(body), `${handler} derives userId only from the session`);
}
assert(
  /createForConsumer\(\{[\s\S]*\.\.\.body,[\s\S]*userId:\s*gate\.session\.user\.id/.test(functionBlock(serverSource, 'createBookingRequestRoute')),
  'session userId overrides every create-body field',
);

const adminListBlock = functionBlock(serverSource, 'listAdminBookingRequestsRoute');
const adminDetailBlock = functionBlock(serverSource, 'getAdminBookingRequestRoute');
const adminTransitionBlock = functionBlock(serverSource, 'transitionAdminBookingRequestRoute');
for (const body of [adminListBlock, adminDetailBlock]) {
  assert(/requireAdminScope\(store, 'booking_requests:read'/.test(body), 'admin reads require the booking read scope from the session');
  assert(/adminId:\s*gate\.session\.adminId\s*\|\|\s*gate\.session\.user\.id/.test(body), 'admin read actor comes only from the authenticated session');
}
assert(/requireAdminScope\(store, 'booking_requests:write'/.test(adminTransitionBlock), 'admin transitions require the booking write scope from the session');
assert(/adminId:\s*gate\.session\.adminId\s*\|\|\s*gate\.session\.user\.id/.test(adminTransitionBlock), 'admin transition actor comes only from the authenticated session');
assert(
  /await handler\(\{[\s\S]*\.\.\.body,[\s\S]*bookingRequestId,[\s\S]*adminId:\s*gate\.session/.test(adminTransitionBlock),
  'trusted booking and admin ids override transition-body fields',
);
assert(!/["'](?:userId|adminId|adminScope|scopes)["']/.test(bookingValidationBlock), 'booking request bodies cannot inject actor ids or scopes');

const requestScopeSelection = /const requestScopedStore = shouldUseRequestScopedStore[\s\S]*?requestScopedStore[\s\S]*?createRequestScopedStore\(\)[\s\S]*?: await dataStore\.load\(\)/;
assert(requestScopeSelection.test(serverSource), 'request-scoped store selection happens before the global read model is loaded');
assert(/dataStore\.kind !== 'postgres'/.test(requestScopeBlock), 'request-scoped booking handling is PostgreSQL-only');
assert(/storeLiteBookingsEnabled/.test(requestScopeBlock), 'request-scoped booking handling is feature gated');
assert(/dataStore\.capabilities\?\.bookingRequests/.test(requestScopeBlock), 'request-scoped booking handling requires the booking gateway capability');
for (const prefix of ['/api/booking-requests', '/api/admin/booking-requests']) {
  assert(requestScopeBlock.includes(`path === '${prefix}'`) && requestScopeBlock.includes(`path.startsWith('${prefix}/')`), `${prefix} list, detail, and action routes use a request-scoped store`);
}
assert(/dataStore\.bookingRequests\./.test(bookingBlock), 'booking handlers call the PostgreSQL gateway directly');
assert(!/store\.bookingRequests|store\.bookingRequest|store\.orders|store\.auditCases/.test(bookingBlock), 'booking handlers never read a global JSON/read-model collection');

assert(/if \(!storeLiteBookingsEnabled\) return error\(404, 'NOT_FOUND', 'Route not found'\)/.test(bookingBlock), 'feature-off booking routes are indistinguishable from absent routes');
assert(/dataStore\.kind !== 'postgres'[\s\S]*BOOKING_POSTGRES_REQUIRED/.test(functionBlock(serverSource, 'bookingRequestReadiness')), 'enabled booking routes fail closed without PostgreSQL');
assert(/return error\(404, 'BOOKING_REQUEST_NOT_FOUND', 'Booking request not found'\)/.test(functionBlock(serverSource, 'bookingRequestNotFound')), 'invalid and inaccessible booking ids share one public 404');
assert(/String\(cause\.code\)\.startsWith\('BOOKING_'\)/.test(functionBlock(serverSource, 'bookingGatewayResponse')), 'booking gateway errors keep their stable public code');
assert(/Number\(cause\.status\) \|\| 500/.test(functionBlock(serverSource, 'bookingGatewayResponse')), 'booking gateway errors keep their mapped status');
assert(/throw cause/.test(functionBlock(serverSource, 'bookingGatewayResponse')), 'unknown gateway errors remain private server failures');

assert(/path === '\/api\/booking-requests' \|\| path\.startsWith\('\/api\/booking-requests\/'\)/.test(securitySource), 'consumer booking routes are protected member routes');
assert(/path\.startsWith\('\/api\/admin\/'\)/.test(securitySource), 'admin booking routes use the admin access policy');
assert(/validateBookingQuery\(params, \{ list: isBookingList \}\)/.test(securitySource), 'booking list and detail queries use the strict validator');
assert(/requireAllowedFields\(body, \[/.test(bookingValidationBlock), 'booking mutations use body-field allowlists');
assert(/bookingRequests:\s*storeLiteBookingsEnabled/.test(postgresStoreSource), 'PostgreSQL advertises booking capability only when enabled');
assert(/\.\.\.\(storeLiteBookingsEnabled[\s\S]*bookingRequests: \{/.test(postgresStoreSource), 'PostgreSQL exposes booking gateways only when enabled');
assert(/STORE_LITE_BOOKINGS_FLAG = 'ENABLE_STORE_LITE_BOOKINGS'/.test(featureSource), 'booking feature has one explicit environment flag');
assert(/String\(value \?\? 'false'\)/.test(featureSource), 'booking feature defaults off');
assert(
  /isStoreLiteRelease && !isStoreLiteAllowedRequest\(req\.method \|\| 'GET', url\.pathname\)[\s\S]*shouldUseRequestScopedStore/.test(serverSource),
  'Store Lite route allowlist runs before any global read-model load',
);
for (const deniedPath of [
  '/api/reports',
  '/api/admin/action-logs',
  '/api/admin/security-events',
  '/api/admin/moderation',
  '/api/admin/audit-cases',
]) {
  assert(!storeLiteAllowlistBlock.includes(`'${deniedPath}'`), `${deniedPath} is not present in the Store Lite allowlist`);
}
assert(
  storeLiteAllowlistBlock.includes("'GET /api/admin/booking-requests'"),
  'Store Lite allowlist retains the dedicated booking operations list API',
);

assert(
  hasExactActionRoute(routeBlock, serverSource, '/api/booking-requests/', 'cancel'),
  'consumer cancel route must accept exactly one id segment',
);
for (const action of ['confirm', 'decline', 'cancel']) {
  assert(
    hasExactActionRoute(routeBlock, serverSource, '/api/admin/booking-requests/', action),
    `admin ${action} route must accept exactly one id segment`,
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'exact-booking-routes',
        'consumer-actor-from-session',
        'admin-actor-and-scope-from-session',
        'booking-body-actor-injection-rejected',
        'request-scoped-postgres-store',
        'no-global-booking-read-model',
        'uniform-booking-not-found',
        'stable-booking-gateway-errors',
        'feature-off-route-not-found',
        'store-lite-server-route-allowlist',
      ],
    },
    null,
    2,
  ),
);

function hasExactActionRoute(routeSource, fullSource, prefix, action) {
  const literal = `^${prefix.replaceAll('/', '\\/')}[^/]+\\/${action}$`;
  if (routeSource.includes(literal)) return true;

  const dispatch = `isNestedRoute(path, '${prefix}', '/${action}')`;
  if (!routeSource.includes(dispatch)) return false;
  const helper = functionBlock(fullSource, 'isNestedRoute');
  return /slice\(prefix\.length, -suffix\.length\)/.test(helper) && /!.*includes\(['"]\/['"]\)/.test(helper);
}

function functionBlock(source, name) {
  const startPattern = new RegExp(`(?:async\\s+)?function\\s+${escapeRegExp(name)}\\s*\\(`, 'g');
  const match = startPattern.exec(source);
  if (!match) throw new Error(`Missing function ${name}`);
  const parameterStart = source.indexOf('(', match.index);
  const parameterEnd = matchingDelimiter(source, parameterStart, '(', ')');
  const braceStart = source.indexOf('{', parameterEnd + 1);
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
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

function matchingDelimiter(source, start, open, close) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
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
    if (character === open) depth += 1;
    if (character === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`Unterminated delimiter starting at ${start}`);
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
