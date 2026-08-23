import type { ApiResponse } from '../types/api';

const reservedHostSuffixes = [
  'example',
  'example.com',
  'example.net',
  'example.org',
  'home.arpa',
  'internal',
  'invalid',
  'lan',
  'local',
  'localhost',
  'onion',
  'test',
] as const;
const configuredBaseUrlValue = String(import.meta.env.VITE_API_BASE_URL ?? '').trim();
const approvedProductionApiOrigin = 'https://api.weareinframe.com';
const appEnvironment = String(import.meta.env.VITE_APP_ENV ?? '').trim().toLowerCase();
const isProduction = appEnvironment === 'production' || (!appEnvironment && import.meta.env.PROD);
const configuredBaseUrl = isProduction
  ? parsePublicHttpsApiOrigin(configuredBaseUrlValue)
  : configuredBaseUrlValue.replace(/\/$/, '');
const apiBaseUrl = configuredBaseUrl || (isProduction ? '' : 'http://127.0.0.1:8787');
const tokenStorageKey = 'still-store-lite-admin-token-v1';

export const adminAuthExpiredEvent = 'store-lite-admin-auth-expired';

let memoryToken = readSessionToken();

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export function hasAdminToken() {
  return Boolean(getAdminToken());
}

export function getAdminToken() {
  memoryToken ||= readSessionToken();
  return memoryToken;
}

export function setAdminToken(token?: string | null) {
  memoryToken = String(token ?? '').trim();
  if (typeof sessionStorage === 'undefined') return;
  if (memoryToken) sessionStorage.setItem(tokenStorageKey, memoryToken);
  else sessionStorage.removeItem(tokenStorageKey);
}

export function clearAdminToken() {
  setAdminToken(null);
}

export function adminGet<T>(path: string) {
  return adminRequest<T>(path, 'GET');
}

export function adminPost<T>(path: string, body?: unknown) {
  return adminRequest<T>(path, 'POST', body);
}

export async function adminRequest<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  if (!apiBaseUrl) throw new AdminApiError(0, 'ADMIN_API_NOT_CONFIGURED', '运营台 API 尚未配置');
  if (path !== '/api/auth/session' && !path.startsWith('/api/admin/')) {
    throw new AdminApiError(0, 'ADMIN_API_PATH_INVALID', '运营台请求路径不在允许范围内');
  }

  const token = getAdminToken();
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AdminApiError(0, 'NETWORK_ERROR', '网络连接失败，请检查网络后重试');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AdminApiError(response.status, 'RESPONSE_INVALID', '服务端返回了无法识别的响应');
  }

  if (!isApiResponse<T>(payload)) {
    throw new AdminApiError(response.status, 'RESPONSE_INVALID', '服务端响应结构无效');
  }

  if (!payload.success) {
    if (response.status === 401) expireAdminSession();
    throw new AdminApiError(response.status, payload.error.code, payload.error.message, payload.error.requestId);
  }

  if (!response.ok) throw new AdminApiError(response.status, 'RESPONSE_STATUS_INVALID', '服务端响应状态无效');
  return payload.data;
}

export function adminErrorMessage(cause: unknown, fallback: string) {
  if (!(cause instanceof AdminApiError)) return cause instanceof Error ? cause.message : fallback;
  const trace = `（${cause.code}${cause.requestId ? ` · 请求 ${cause.requestId}` : ''}）`;
  if (cause.status === 401) return `登录已失效，请重新登录 ${trace}`;
  if (cause.status === 403) return `${cause.code === 'ADMIN_SCOPE_REQUIRED' ? '当前账号缺少执行此操作的权限' : '当前账号无权访问该资源'} ${trace}`;
  if (cause.status === 409) return `记录状态已变化，页面已刷新，请核对后重试 ${trace}`;
  if (cause.status === 429) return `操作过于频繁，请稍后再试 ${trace}`;
  if (cause.status === 503) return `服务暂时不可用，请稍后重试 ${trace}`;
  if (cause.code === 'ADMIN_CREDENTIALS_INVALID') return `用户名或密码错误 ${trace}`;
  if (cause.code === 'BOOKING_PUBLIC_TEXT_UNSAFE') return `公开说明中不能包含手机号、外部联系方式、链接或资金交易引导 ${trace}`;
  return `${cause.message || fallback} ${trace}`;
}

export function isConflictError(cause: unknown): cause is AdminApiError {
  return cause instanceof AdminApiError && cause.status === 409;
}

function expireAdminSession() {
  clearAdminToken();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(adminAuthExpiredEvent));
}

function readSessionToken() {
  if (typeof sessionStorage === 'undefined') return '';
  return String(sessionStorage.getItem(tokenStorageKey) ?? '').trim();
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ApiResponse<T>>;
  return candidate.success === true || candidate.success === false;
}

function parsePublicHttpsApiOrigin(value: string) {
  if (!value) throw new Error('Store Lite Admin production requires VITE_API_BASE_URL.');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Store Lite Admin VITE_API_BASE_URL must be a valid public HTTPS URL.');
  }
  if (parsed.protocol !== 'https:') throw new Error('Store Lite Admin VITE_API_BASE_URL must use HTTPS.');
  if (parsed.username || parsed.password) throw new Error('Store Lite Admin VITE_API_BASE_URL must not contain credentials.');
  if (parsed.port && parsed.port !== '443') {
    throw new Error('Store Lite Admin VITE_API_BASE_URL must use the standard HTTPS port 443.');
  }
  if (parsed.search || parsed.hash || parsed.href.includes('?') || parsed.href.includes('#')) {
    throw new Error('Store Lite Admin VITE_API_BASE_URL must not contain a query string or fragment.');
  }
  if (parsed.pathname !== '/') throw new Error('Store Lite Admin VITE_API_BASE_URL must be an HTTPS origin without a path.');

  const rawHostname = parsed.hostname.toLowerCase();
  if (rawHostname.endsWith('.')) throw new Error('Store Lite Admin VITE_API_BASE_URL must not use a hostname with a trailing dot.');
  const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']') ? rawHostname.slice(1, -1) : rawHostname;
  if (isIpLiteral(hostname)) throw new Error('Store Lite Admin VITE_API_BASE_URL must use a public DNS hostname, not an IP address.');
  if (!hostname.includes('.')) throw new Error('Store Lite Admin VITE_API_BASE_URL must use a multi-label public DNS hostname.');
  if (reservedHostSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
    throw new Error('Store Lite Admin VITE_API_BASE_URL must not use a reserved or private hostname suffix.');
  }
  const labels = hostname.split('.');
  if (hostname.length > 253 || labels.some((part) => !isValidDnsLabel(part))) {
    throw new Error('Store Lite Admin VITE_API_BASE_URL must use a canonical public DNS hostname.');
  }
  if (parsed.origin !== approvedProductionApiOrigin) {
    throw new Error('Store Lite Admin VITE_API_BASE_URL must use the approved Still API origin.');
  }
  return parsed.origin;
}

function isIpLiteral(hostname: string) {
  if (hostname.includes(':')) return true;
  const parts = hostname.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isValidDnsLabel(value: string) {
  return value.length <= 63 && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
}
