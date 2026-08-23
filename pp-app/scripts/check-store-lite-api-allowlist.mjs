import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(new URL('../src/store-lite/storeLiteHttp.ts', import.meta.url));
const originalSource = readFileSync(sourcePath, 'utf8');
const fixtureEnvName = '__STORE_LITE_API_ALLOWLIST_TEST_ENV__';
const instrumentedSource = originalSource.replaceAll('import.meta.env', `globalThis.${fixtureEnvName}`);
if (instrumentedSource === originalSource || instrumentedSource.includes('import.meta.env')) {
  throw new Error('Store Lite API allowlist guard could not isolate the Vite environment.');
}

const transpiled = ts.transpileModule(instrumentedSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
  reportDiagnostics: true,
});
const transpileFailures = (transpiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
if (transpileFailures.length) {
  throw new Error(`Store Lite HTTP policy did not transpile: ${formatDiagnostic(transpileFailures[0])}`);
}

const originalStorage = globalThis.localStorage;
const originalFetch = globalThis.fetch;
const token = 'store-lite-policy-secret-token';
const storage = new Map([['pp-auth-token-v1', token]]);
globalThis[fixtureEnvName] = {
  VITE_API_BASE_URL: 'http://127.0.0.1:8787',
  VITE_APP_ENV: 'development',
  PROD: false,
};
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

try {
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}#store-lite-api-policy`;
  const policyModule = await import(moduleUrl);
  const assertAllowed = policyModule.assertStoreLiteApiRequestAllowed;
  if (typeof assertAllowed !== 'function') throw new Error('Store Lite HTTP policy must export its allowlist assertion.');

  const accepted = [
    ['GET', '/api/auth/session'],
    ['POST', '/api/auth/phone/request-code'],
    ['POST', '/api/auth/phone/verify'],
    ['POST', '/api/auth/logout'],
    ['GET', '/api/feed/posts'],
    ['GET', '/api/feed/posts?limit=20&cursor=cursor%2Fnext&city=%E4%B8%8A%E6%B5%B7'],
    ['GET', '/api/posts/post-wukang'],
    ['GET', '/api/companions/companion-mori'],
    ['GET', '/api/companions/companion-mori/posts?limit=30&cursor=next'],
    ['POST', '/api/booking-requests'],
    ['GET', '/api/booking-requests?status=pending&limit=20&cursor=next'],
    ['GET', '/api/booking-requests/8ee63833-747d-4624-86ef-349745b762d9'],
    ['POST', '/api/booking-requests/8ee63833-747d-4624-86ef-349745b762d9/cancel'],
    ['POST', '/api/user-requests'],
    ['GET', '/api/user-requests?requestType=support&status=submitted&limit=20&cursor=next'],
    ['GET', '/api/user-requests/user-request-1'],
    ['POST', '/api/user-requests/user-request-1/cancel'],
    ['POST', '/api/content-reports'],
    ['GET', '/api/me/content-reports?status=submitted&targetType=post&limit=20&cursor=next'],
    ['GET', '/api/me/content-reports/content-report-1'],
    ['GET', '/api/me/blocked-companions?limit=20&cursor=next'],
    ['PUT', '/api/me/blocked-companions/companion-mori'],
    ['DELETE', '/api/me/blocked-companions/companion-mori'],
  ];
  const rejected = [
    ['GET', '/api/admin/bookings'],
    ['GET', '/api/orders'],
    ['POST', '/api/feed/posts'],
    ['GET', '/api/auth/phone/request-code'],
    ['DELETE', '/api/booking-requests'],
    ['POST', '/api/me/blocked-companions/companion-mori'],
    ['GET', '/api/posts/post-wukang/extra'],
    ['GET', '/api/companions/companion-mori/posts/extra'],
    ['POST', '/api/booking-requests/id/cancel/extra'],
    ['GET', '/api/user-requests/id/cancel'],
    ['GET', '/api/me/content-reports/id/extra'],
    ['GET', '/api/posts/../admin'],
    ['GET', '/api/posts/%2e%2e'],
    ['GET', '/api/posts/%2E%2E'],
    ['GET', '/api/posts/%252e%252e'],
    ['GET', '/api/posts/id%2Fadmin'],
    ['GET', '/api/posts/id%5Cadmin'],
    ['GET', '/api/posts//id'],
    ['GET', '/api/posts/id/'],
    ['GET', '/api/posts/.'],
    ['GET', '/api/posts/..'],
    ['GET', '/api/posts/id\\extra'],
    ['GET', 'https://api.weareinframe.com/api/feed/posts'],
    ['GET', '//api.weareinframe.com/api/feed/posts'],
    ['GET', ' /api/feed/posts'],
    ['GET', '/api/feed/posts '],
    ['GET', '/api/feed/posts#debug'],
    ['GET', '/api/feed/posts?'],
    ['GET', '/api/feed/posts?limit=20?cursor=next'],
    ['GET', '/api/feed/posts?limit=20&limit=30'],
    ['GET', '/api/feed/posts?admin=true'],
    ['GET', '/api/posts/post-wukang?limit=20'],
    ['GET', '/api/feed/posts?%61dmin=true'],
    ['PATCH', '/api/booking-requests/id'],
    ['get', '/api/feed/posts'],
  ];

  const failures = [];
  for (const [method, path] of accepted) {
    try {
      const result = assertAllowed(path, method);
      if (result !== path) failures.push(`approved request was rewritten: ${method} ${path}`);
    } catch (error) {
      failures.push(`expected acceptance for ${method} ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const [method, path] of rejected) {
    try {
      assertAllowed(path, method);
      failures.push(`expected rejection for ${method} ${path}`);
    } catch {
      // Expected: unknown capabilities and ambiguous paths are closed before fetch.
    }
  }

  let fetchCalls = 0;
  let capturedUrl = '';
  let capturedAuthorization = '';
  globalThis.fetch = async (url, init = {}) => {
    fetchCalls += 1;
    capturedUrl = String(url);
    capturedAuthorization = String(init.headers?.Authorization || '');
    return {
      status: 200,
      json: async () => ({ success: true, data: { ok: true } }),
    };
  };
  try {
    await policyModule.storeLiteGet('/api/admin/bookings');
    failures.push('forbidden wrapper request unexpectedly resolved');
  } catch {
    // Expected: the public wrapper must execute the allowlist before fetch.
  }
  if (fetchCalls !== 0) failures.push('forbidden wrapper request reached fetch or exposed its bearer token');

  await policyModule.storeLiteGet('/api/feed/posts?limit=20');
  if (fetchCalls !== 1) failures.push('approved wrapper request did not reach fetch exactly once');
  if (capturedUrl !== 'http://127.0.0.1:8787/api/feed/posts?limit=20') failures.push('approved wrapper request changed its target');
  if (capturedAuthorization !== `Bearer ${token}`) failures.push('approved wrapper request did not preserve consumer authorization');

  if (failures.length) {
    console.error('Store Lite API allowlist guard failed.');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`Store Lite API allowlist guard passed (${accepted.length} accepted, ${rejected.length} rejected).`);
  }
} finally {
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
  if (originalFetch === undefined) delete globalThis.fetch;
  else globalThis.fetch = originalFetch;
  delete globalThis[fixtureEnvName];
}

function formatDiagnostic(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}
