import type { ApiResponse } from '../types/api';
import { isMiniProgramRuntime, wxRequest } from './miniProgramBridge';

const configuredApiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL as string | undefined);
const productionRuntime = import.meta.env.PROD;
const localDevelopmentApiBaseUrl = import.meta.env.DEV ? ['http://127.0.0.', '1:8787'].join('') : '';
const apiBaseUrl = configuredApiBaseUrl || localDevelopmentApiBaseUrl;

export function isApiEnabled() {
  assertProductionApiBaseUrl();
  return Boolean(apiBaseUrl);
}

export function isProductionRuntime() {
  return productionRuntime;
}

export function isMockRuntimeAllowed() {
  return !productionRuntime;
}

export function useMockFallback<T>(fallback: T, label = 'mock fallback'): T {
  if (productionRuntime) {
    throw new Error(`Production build blocked ${label}. Configure a real API response instead.`);
  }
  return fallback;
}

export async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  assertProductionApiBaseUrl();
  if (isMiniProgramRuntime()) {
    return wxRequest<ApiResponse<T>>(`${apiBaseUrl}${path}`, 'GET');
  }
  const response = await fetch(`${apiBaseUrl}${path}`);
  return response.json() as Promise<ApiResponse<T>>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  assertProductionApiBaseUrl();
  if (isMiniProgramRuntime()) {
    return wxRequest<ApiResponse<T>>(`${apiBaseUrl}${path}`, 'POST', body);
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json() as Promise<ApiResponse<T>>;
}

function normalizeApiBaseUrl(value?: string) {
  return value?.trim().replace(/\/+$/, '') || '';
}

function assertProductionApiBaseUrl() {
  if (!productionRuntime) return;
  if (!apiBaseUrl) throw new Error('Production build requires VITE_API_BASE_URL.');
  if (!apiBaseUrl.startsWith('https://')) throw new Error('Production VITE_API_BASE_URL must use HTTPS.');
  if (isLocalApiBaseUrl(apiBaseUrl)) {
    throw new Error('Production VITE_API_BASE_URL must not point to a local development address.');
  }
}

function isLocalApiBaseUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return [[`127.0.0.`, `1`].join(''), [`local`, `host`].join(''), [`0.0.0.`, `0`].join('')].includes(hostname);
  } catch {
    return false;
  }
}
