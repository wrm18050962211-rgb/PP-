import type { ApiResponse } from '../types/api';

const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');
const approvedProductionApiOrigin = 'https://api.weareinframe.com';
const appEnvironment = String(import.meta.env.VITE_APP_ENV ?? '').trim().toLowerCase();
const isProduction = appEnvironment === 'production' || (!appEnvironment && import.meta.env.PROD);
const localBaseUrl = import.meta.env.PROD ? '' : 'http://127.0.0.1:8787';
const baseUrl = configuredBaseUrl || (isProduction ? '' : localBaseUrl);
const publicTokenStorageKey = 'pp-auth-token-v1';
export const storeLiteAuthExpiredEvent = 'store-lite-auth-expired';
let publicToken = readStoredToken();

type StoreLiteHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type StoreLiteApiRoute = {
  method: StoreLiteHttpMethod;
  pathname: RegExp;
  queryKeys?: readonly string[];
};

const storeLiteApiRoutes: readonly StoreLiteApiRoute[] = [
  { method: 'GET', pathname: /^\/api\/auth\/session$/ },
  { method: 'POST', pathname: /^\/api\/auth\/phone\/request-code$/ },
  { method: 'POST', pathname: /^\/api\/auth\/phone\/verify$/ },
  { method: 'POST', pathname: /^\/api\/auth\/logout$/ },
  { method: 'GET', pathname: /^\/api\/feed\/posts$/, queryKeys: ['limit', 'cursor', 'city'] },
  { method: 'GET', pathname: /^\/api\/posts\/[A-Za-z0-9][A-Za-z0-9._~-]{0,199}$/ },
  { method: 'GET', pathname: /^\/api\/companions\/[A-Za-z0-9][A-Za-z0-9._~-]{0,199}$/ },
  {
    method: 'GET',
    pathname: /^\/api\/companions\/[A-Za-z0-9][A-Za-z0-9._~-]{0,199}\/posts$/,
    queryKeys: ['limit', 'cursor'],
  },
  { method: 'POST', pathname: /^\/api\/booking-requests$/ },
  { method: 'GET', pathname: /^\/api\/booking-requests$/, queryKeys: ['status', 'limit', 'cursor'] },
  { method: 'GET', pathname: /^\/api\/booking-requests\/[A-Za-z0-9][A-Za-z0-9._~-]{0,199}$/ },
  { method: 'POST', pathname: /^\/api\/booking-requests\/[A-Za-z0-9][A-Za-z0-9._~-]{0,199}\/cancel$/ },
  { method: 'POST', pathname: /^\/api\/user-requests$/ },
  { method: 'GET', pathname: /^\/api\/user-requests$/, queryKeys: ['requestType', 'status', 'limit', 'cursor'] },
  { method: 'GET', pathname: /^\/api\/user-requests\/[A-Za-z0-9][A-Za-z0-9._~-]{0,199}$/ },
  { method: 'POST', pathname: /^\/api\/user-requests\/[A-Za-z0-9][A-Za-z0-9._~-]{0,199}\/cancel$/ },
  { method: 'POST', pathname: /^\/api\/content-reports$/ },
  { method: 'GET', pathname: /^\/api\/me\/content-reports$/, queryKeys: ['status', 'targetType', 'limit', 'cursor'] },
  { method: 'GET', pathname: /^\/api\/me\/content-reports\/[A-Za-z0-9][A-Za-z0-9._~-]{0,199}$/ },
  { method: 'GET', pathname: /^\/api\/me\/blocked-companions$/, queryKeys: ['limit', 'cursor'] },
  { method: 'PUT', pathname: /^\/api\/me\/blocked-companions\/[A-Za-z0-9][A-Za-z0-9._~-]{0,199}$/ },
  { method: 'DELETE', pathname: /^\/api\/me\/blocked-companions\/[A-Za-z0-9][A-Za-z0-9._~-]{0,199}$/ },
] as const;

if (isProduction && !configuredBaseUrl) {
  throw new Error('Store Lite production builds require VITE_API_BASE_URL.');
}
if (isProduction && readOrigin(configuredBaseUrl) !== approvedProductionApiOrigin) {
  throw new Error('Store Lite production API origin is not approved.');
}

export function getStoreLiteToken() {
  publicToken ||= readStoredToken();
  return publicToken;
}

export function setStoreLiteToken(token?: string | null) {
  publicToken = String(token ?? '').trim();
  if (typeof localStorage === 'undefined') return;
  if (publicToken) localStorage.setItem(publicTokenStorageKey, publicToken);
  else localStorage.removeItem(publicTokenStorageKey);
}

export function clearStoreLiteToken() {
  setStoreLiteToken(null);
}

export function storeLiteGet<T>(path: string) {
  return storeLiteRequest<T>(path, 'GET');
}

export function storeLitePost<T>(path: string, body?: unknown) {
  return storeLiteRequest<T>(path, 'POST', body);
}

export function storeLitePut<T>(path: string, body?: unknown) {
  return storeLiteRequest<T>(path, 'PUT', body);
}

export function storeLiteDelete<T>(path: string, body?: unknown) {
  return storeLiteRequest<T>(path, 'DELETE', body);
}

async function storeLiteRequest<T>(path: string, method: StoreLiteHttpMethod, body?: unknown): Promise<ApiResponse<T>> {
  if (!baseUrl) throw new Error('Store Lite API is not configured.');
  const approvedPath = assertStoreLiteApiRequestAllowed(path, method);
  const token = getStoreLiteToken();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${approvedPath}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('网络连接失败，请检查网络后重试');
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('服务端返回了无法识别的响应');
  }
  if (!isApiResponse<T>(payload)) throw new Error('服务端响应结构无效');
  if (response.status === 401) {
    clearStoreLiteToken();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(storeLiteAuthExpiredEvent));
  }
  return payload;
}

/**
 * Store Lite is a deliberately narrow client. Every outbound request must match
 * one approved method/path pair before the bearer token can reach `fetch`.
 */
export function assertStoreLiteApiRequestAllowed(path: string, method: StoreLiteHttpMethod) {
  if (typeof path !== 'string' || path !== path.trim() || !path.startsWith('/api/')) {
    throw new Error('Store Lite API request is not allowed.');
  }
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method) || hasUnsafeStoreLiteRequestCharacter(path)) {
    throw new Error('Store Lite API request is not allowed.');
  }

  const questionMark = path.indexOf('?');
  if (questionMark !== -1 && path.indexOf('?', questionMark + 1) !== -1) {
    throw new Error('Store Lite API request is not allowed.');
  }
  const pathname = questionMark === -1 ? path : path.slice(0, questionMark);
  const query = questionMark === -1 ? '' : path.slice(questionMark + 1);
  if (!isCanonicalStoreLitePathname(pathname)) throw new Error('Store Lite API request is not allowed.');

  const route = storeLiteApiRoutes.find((candidate) => candidate.method === method && candidate.pathname.test(pathname));
  if (!route || !isAllowedStoreLiteQuery(query, questionMark !== -1, route.queryKeys)) {
    throw new Error('Store Lite API request is not allowed.');
  }
  return path;
}

function isCanonicalStoreLitePathname(pathname: string) {
  if (!pathname.startsWith('/api/') || pathname.endsWith('/') || pathname.includes('//')) return false;
  const segments = pathname.slice(1).split('/');
  return segments.every((segment) => {
    if (!segment || !/^[A-Za-z0-9._~-]+$/.test(segment) || segment === '.' || segment === '..') return false;
    try {
      return decodeURIComponent(segment) === segment;
    } catch {
      return false;
    }
  });
}

function isAllowedStoreLiteQuery(query: string, hasQuery: boolean, allowedKeys: readonly string[] | undefined) {
  if (!hasQuery) return true;
  if (!query) return false;
  if (!allowedKeys?.length || !/^(?:[^%&=+#?]|%[0-9A-Fa-f]{2}|[&=+])*$/u.test(query)) return false;
  const params = new URLSearchParams(query);
  const seen = new Set<string>();
  for (const [key] of params) {
    if (!allowedKeys.includes(key) || seen.has(key)) return false;
    seen.add(key);
  }
  return seen.size > 0;
}

function hasUnsafeStoreLiteRequestCharacter(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127 || character === '\\' || character === '#') return true;
  }
  return false;
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ApiResponse<T>>;
  return candidate.success === true || candidate.success === false;
}

function readStoredToken() {
  if (typeof localStorage === 'undefined') return '';
  return String(localStorage.getItem(publicTokenStorageKey) ?? '').trim();
}

function readOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}
