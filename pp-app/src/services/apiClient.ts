import type { ApiResponse } from '../types/api';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

export function isApiEnabled() {
  return Boolean(apiBaseUrl);
}

export async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  if (!apiBaseUrl) {
    throw new Error('VITE_API_BASE_URL is not configured');
  }

  const response = await fetch(`${apiBaseUrl}${path}`);
  return response.json() as Promise<ApiResponse<T>>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  if (!apiBaseUrl) {
    throw new Error('VITE_API_BASE_URL is not configured');
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json() as Promise<ApiResponse<T>>;
}
