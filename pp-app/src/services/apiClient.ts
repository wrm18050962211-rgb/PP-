import type { ApiResponse } from '../types/api';
import { isMiniProgramRuntime, wxRequest } from './miniProgramBridge';

const localApiBaseUrl = import.meta.env.PROD ? '' : 'http://127.0.0.1:8787';
const configuredApiBaseUrl = normalizeEnvValue(import.meta.env.VITE_API_BASE_URL);
const appEnv = normalizeEnvValue(import.meta.env.VITE_APP_ENV).toLowerCase();
const viteMode = normalizeEnvValue(import.meta.env.MODE).toLowerCase();
const enableMockFallback = normalizeEnvValue(import.meta.env.VITE_ENABLE_MOCK).toLowerCase();
const enableTestRoleSwitch = normalizeEnvValue(import.meta.env.VITE_ENABLE_TEST_ROLE_SWITCH).toLowerCase();
export type ApiAuthTokenScope = 'public' | 'admin';

const authTokenStorageKeys: Record<ApiAuthTokenScope, string> = {
  public: 'pp-auth-token-v1',
  admin: 'pp-admin-auth-token-v1',
};
const currentAuthTokens: Record<ApiAuthTokenScope, string> = {
  public: readStoredAuthToken('public'),
  admin: readStoredAuthToken('admin'),
};

export const isProductionAppEnv = appEnv === 'production' || (!appEnv && (import.meta.env.PROD || viteMode === 'production'));
export const apiBaseUrl = configuredApiBaseUrl || (isProductionAppEnv ? '' : localApiBaseUrl);

if (isProductionAppEnv && !configuredApiBaseUrl) {
  throw new Error('Production app builds require VITE_API_BASE_URL. Refusing to use the local API default.');
}

export function isApiEnabled() {
  return Boolean(apiBaseUrl);
}

export function isMockFallbackAllowed() {
  if (isProductionAppEnv) return false;
  return enableMockFallback !== 'false';
}

export function isTestRoleSwitchAllowed() {
  if (isProductionAppEnv) return false;
  return enableTestRoleSwitch !== 'false';
}

export function getApiFallback<T>(fallback: T, context: string): T {
  if (isMockFallbackAllowed()) return fallback;
  throw new Error(`${context} API failed and mock fallback is disabled.`);
}

export function setApiAuthToken(token?: string | null, scope: ApiAuthTokenScope = 'public') {
  currentAuthTokens[scope] = normalizeEnvValue(token);
  if (typeof localStorage === 'undefined') return;

  if (currentAuthTokens[scope]) localStorage.setItem(authTokenStorageKeys[scope], currentAuthTokens[scope]);
  else localStorage.removeItem(authTokenStorageKeys[scope]);
}

export function clearApiAuthToken(scope: ApiAuthTokenScope | 'all' = 'public') {
  if (scope === 'all') {
    setApiAuthToken(null, 'public');
    setApiAuthToken(null, 'admin');
    return;
  }
  setApiAuthToken(null, scope);
}

export function getApiAuthToken(scope: ApiAuthTokenScope = 'public') {
  currentAuthTokens[scope] ||= readStoredAuthToken(scope);
  return currentAuthTokens[scope];
}

export async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  const url = buildApiUrl(path);
  const headers = buildApiHeaders(path);
  if (isMiniProgramRuntime()) {
    return wxRequest<ApiResponse<T>>(url, 'GET', undefined, headers);
  }
  const response = await fetch(url, { headers });
  return response.json() as Promise<ApiResponse<T>>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  const url = buildApiUrl(path);
  const headers = buildApiHeaders(path, { 'Content-Type': 'application/json' });
  if (isMiniProgramRuntime()) {
    return wxRequest<ApiResponse<T>>(url, 'POST', body, headers);
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json() as Promise<ApiResponse<T>>;
}

function buildApiUrl(path: string) {
  if (!apiBaseUrl) {
    throw new Error('API base URL is not configured.');
  }
  return `${apiBaseUrl}${path}`;
}

function buildApiHeaders(path: string, baseHeaders: Record<string, string> = {}) {
  const token = getApiAuthToken(resolveAuthScope(path));
  return token ? { ...baseHeaders, Authorization: `Bearer ${token}` } : baseHeaders;
}

function resolveAuthScope(path: string): ApiAuthTokenScope {
  return path.startsWith('/api/admin/') ? 'admin' : 'public';
}

function normalizeEnvValue(value: unknown) {
  return String(value ?? '').trim();
}

function readStoredAuthToken(scope: ApiAuthTokenScope) {
  if (typeof localStorage === 'undefined') return '';
  return normalizeEnvValue(localStorage.getItem(authTokenStorageKeys[scope]));
}
