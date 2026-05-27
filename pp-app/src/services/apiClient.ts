import type { ApiResponse } from '../types/api';

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const apiBaseUrl = configuredApiBaseUrl || 'http://127.0.0.1:8787';

export function isApiEnabled() {
  return Boolean(apiBaseUrl);
}

export async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  return response.json() as Promise<ApiResponse<T>>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json() as Promise<ApiResponse<T>>;
}
