import type { ApiResponse } from '../types/api';
import { isMiniProgramRuntime, wxRequest } from './miniProgramBridge';

const localApiBaseUrl = 'http://127.0.0.1:8787';
const configuredApiBaseUrl = normalizeEnvValue(import.meta.env.VITE_API_BASE_URL);
const appEnv = normalizeEnvValue(import.meta.env.VITE_APP_ENV).toLowerCase();
const enableMockFallback = normalizeEnvValue(import.meta.env.VITE_ENABLE_MOCK).toLowerCase();
const enableTestRoleSwitch = normalizeEnvValue(import.meta.env.VITE_ENABLE_TEST_ROLE_SWITCH).toLowerCase();

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

export async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  const url = buildApiUrl(path);
  if (isMiniProgramRuntime()) {
    return wxRequest<ApiResponse<T>>(url, 'GET');
  }
  const response = await fetch(url);
  return response.json() as Promise<ApiResponse<T>>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  const url = buildApiUrl(path);
  if (isMiniProgramRuntime()) {
    return wxRequest<ApiResponse<T>>(url, 'POST', body);
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

function normalizeEnvValue(value: unknown) {
  return String(value ?? '').trim();
}
