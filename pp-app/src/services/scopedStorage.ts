import { getActiveAccountStorageScope } from './authService';
import type { UserRole } from '../types/api';

type StorageLayer = 'local' | 'cloud';

export function scopedStorageKey(key: string, role?: UserRole, layer: StorageLayer = 'local') {
  return `pp-${layer}-db:${getActiveAccountStorageScope(role)}:${key}`;
}

export function readScopedJson<T>(key: string, fallback: T, role?: UserRole, layer: StorageLayer = 'local'): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(scopedStorageKey(key, role, layer));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeScopedJson<T>(key: string, value: T, role?: UserRole, layer: StorageLayer = 'local') {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(scopedStorageKey(key, role, layer), JSON.stringify(value));
}
