import type { ApiResponse } from '../types/api';
import { isMiniProgramRuntime, wxRequest } from './miniProgramBridge';

const localApiBaseUrl = 'http://127.0.0.1:8787';
const configuredApiBaseUrl = normalizeEnvValue(import.meta.env.VITE_API_BASE_URL);
const appEnv = normalizeEnvValue(import.meta.env.VITE_APP_ENV).toLowerCase();
const enableMockFallback = normalizeEnvValue(import.meta.env.VITE_ENABLE_MOCK).toLowerCase();
const enableTestRoleSwitch = normalizeEnvValue(import.meta.env.VITE_ENABLE_TEST_ROLE_SWITCH).toLowerCase();
const authTokenStorageKey = 'pp-auth-token-v1';
let currentAuthToken = readStoredAuthToken();

export const isProductionAppEnv = appEnv === 'production';
export const apiBaseUrl = configuredApiBaseUrl || (isProductionAppEnv ? '' : localApiBaseUrl);

if (isProductionAppEnv && !configuredApiBaseUrl) {
  throw new Error('VITE_APP_ENV=production requires VITE_API_BASE_URL. Refusing to use the local API default.');
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

export function setApiAuthToken(token?: string | null) {
  currentAuthToken = normalizeEnvValue(token);
  if (typeof localStorage === 'undefined') return;

  if (currentAuthToken) localStorage.setItem(authTokenStorageKey, currentAuthToken);
  else localStorage.removeItem(authTokenStorageKey);
}

export function clearApiAuthToken() {
  setApiAuthToken(null);
}

export function getApiAuthToken() {
  currentAuthToken ||= readStoredAuthToken();
  return currentAuthToken;
}

export async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  const url = buildApiUrl(path);
  const headers = buildApiHeaders();
  if (isMiniProgramRuntime()) {
    return wxRequest<ApiResponse<T>>(url, 'GET', undefined, headers);
  }
  const response = await fetch(url, { headers });
  return response.json() as Promise<ApiResponse<T>>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  const url = buildApiUrl(path);
  const headers = buildApiHeaders({ 'Content-Type': 'application/json' });
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

function buildApiHeaders(baseHeaders: Record<string, string> = {}) {
  const token = getApiAuthToken();
  return token ? { ...baseHeaders, Authorization: `Bearer ${token}` } : baseHeaders;
}

function normalizeEnvValue(value: unknown) {
  return String(value ?? '').trim();
}

function readStoredAuthToken() {
  if (typeof localStorage === 'undefined') return '';
  return normalizeEnvValue(localStorage.getItem(authTokenStorageKey));
}
