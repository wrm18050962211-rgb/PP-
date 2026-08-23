import { readFileSync } from 'node:fs';

const serverSource = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const storeSource = readFileSync(new URL('../store/postgresStore.mjs', import.meta.url), 'utf8');
const securitySource = readFileSync(new URL('../security/requestSecurity.mjs', import.meta.url), 'utf8');

assert(
  /if \(method === 'GET' && path === '\/api\/orders'\) return listOrders\(store, url\)/.test(serverSource),
  'order list route is explicit',
);
assert(
  /if \(method === 'GET' && \/\^\\\/api\\\/orders\\\/\[\^\/\]\+\$\/\.test\(path\)\) return getOrderDetail\(store, path, url\)/.test(serverSource),
  'order detail route matches exactly one path segment',
);
assert(/async function listOrders\(store, url\)/.test(serverSource), 'order list route is asynchronous');
assert(/async function getOrderDetail\(store, path, url\)/.test(serverSource), 'order detail route is asynchronous');
assert(/dataStore\.orderReads\.listOrders\(\{[\s\S]*\.\.\.actor,[\s\S]*status:[\s\S]*limit,[\s\S]*cursor/.test(serverSource), 'list delegates to authoritative gateway');
assert(/dataStore\.orderReads\.getOrder\(\{ \.\.\.actor, orderId \}\)/.test(serverSource), 'detail delegates to authoritative gateway');
assert(/sessionRole = session\.role === 'companion' \? 'companion' : 'user'/.test(serverSource), 'public role derives from the session');
assert(/\{ role: 'companion', companionId: session\.companionId \}/.test(serverSource), 'companion owner comes from the session');
assert(/\{ role: 'consumer', userId: session\.user\.id \}/.test(serverSource), 'consumer owner comes from the session');
assert(/ORDER_ROLE_FORBIDDEN/.test(serverSource), 'role mismatch has a stable forbidden response');
assert((serverSource.match(/ORDER_POSTGRES_REQUIRED/g) || []).length >= 2, 'production list and detail refuse JSON fallback');
assert(/ORDER_READ_FAILED/.test(serverSource) && /ORDER_CURSOR_INVALID/.test(serverSource), 'gateway failures map to stable public errors');
assert(/validateRouteQuery\(req\.method \|\| 'GET', url\.pathname, url\.searchParams\)/.test(serverSource), 'query validation runs before routing');
assert(
  /const requestScopedStore = shouldUseRequestScopedStore\(req\.method \|\| 'GET', url\.pathname\)[\s\S]*requestScopedStore[\s\S]*createRequestScopedStore\(\)[\s\S]*dataStore\.load\(\)/.test(serverSource),
  'authoritative order routes choose a request-scoped store before the global read model',
);
assert(
  /function shouldUseRequestScopedStore[\s\S]*path === '\/api\/orders'[\s\S]*confirm\|complete\|cancel\|status[\s\S]*\/api\\\/admin\\\/orders/.test(serverSource),
  'request-scoped store covers list, detail, public lifecycle actions, and both admin status routes',
);
assert(
  /function listPublicJsonOrders[\s\S]*viewPublicOrderSummary\(order, actor\.role\)/.test(serverSource)
    && /return json\(viewPublicOrderDetail\(order, actor\.role\)\)/.test(serverSource),
  'development JSON fallback uses the same public whitelist boundary',
);
assert(
  /async function resolveOrderMutationAccess[\s\S]*dataStore\.orderReads\.getOrder\(\{ \.\.\.actor, orderId \}\)/.test(serverSource),
  'PostgreSQL lifecycle actions resolve the owned order per request rather than from the latest-100 snapshot',
);

assert(/getOrderDetailForActor, getOrderDetailForAdmin, listOrdersForActor/.test(storeSource), 'postgres store imports public and admin order read functions');
assert(/orderReads: true/.test(storeSource), 'postgres store advertises order read capability');
assert(/orderReads: \{[\s\S]*listOrders:[\s\S]*getOrder:[\s\S]*getOrderForAdmin:/.test(storeSource), 'postgres store exposes public and admin detail gateways');
assert(
  /listOrdersForActor\(client, \{[\s\S]*\.\.\.options,[\s\S]*includeServiceItems: compositeOrderDomainEnabled/.test(storeSource),
  'list serviceItems flag is forced by the store feature flag',
);
assert(
  /getOrderDetailForActor\(client, \{[\s\S]*\.\.\.options,[\s\S]*includeServiceItems: compositeOrderDomainEnabled/.test(storeSource),
  'detail serviceItems flag is forced by the store feature flag',
);
assert(
  /getOrderDetailForAdmin\(client, \{[\s\S]*\.\.\.options,[\s\S]*includeServiceItems: compositeOrderDomainEnabled/.test(storeSource),
  'admin detail serviceItems flag is forced by the store feature flag',
);

assert(/const allowed = new Set\(isOrderList \? \['role', 'status', 'limit', 'cursor'\] : \[\]\)/.test(securitySource), 'detail rejects query parameters');
assert(/ORDER_CURSOR_INVALID/.test(securitySource), 'cursor syntax has a dedicated stable error');
assert(/params\.getAll\(key\)\.length !== 1/.test(securitySource), 'duplicate order query parameters are rejected');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'exact-list-and-detail-routes',
        'session-derived-owner-scope',
        'authoritative-postgres-gateway',
        'production-json-fail-closed',
        'stable-error-mapping',
        'feature-flag-forced-in-store',
        'strict-query-validation',
        'request-scoped-store-before-global-read-model',
        'request-scoped-lifecycle-order-lookup',
        'safe-json-public-dto',
      ],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres order read route check failed: ${message}`);
}
