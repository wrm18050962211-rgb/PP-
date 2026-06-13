import { getActiveAccountStorageScope } from './authService';
import type { UserRole } from '../types/api';

export type StorageLayer = 'local' | 'cloud';
export type DataSensitivity = 'device' | 'user' | 'sensitive' | 'regulated';

export type DataDomainPolicy = {
  layer: StorageLayer;
  sensitivity: DataSensitivity;
  owner: 'account-role' | 'shared-order' | 'admin';
  migrationTarget: string;
  note: string;
};

const defaultPolicy: DataDomainPolicy = {
  layer: 'local',
  sensitivity: 'user',
  owner: 'account-role',
  migrationTarget: 'TencentDB user_private_data',
  note: 'Default account-scoped user data. Confirm the domain policy before adding production sync.',
};

export const dataDomainPolicies: Record<string, DataDomainPolicy> = {
  'app-data-v1': {
    layer: 'cloud',
    sensitivity: 'sensitive',
    owner: 'shared-order',
    migrationTarget: 'TencentDB orders / companion_profiles / booking_settings / work_drafts',
    note: 'Orders, onboarding review state, booking settings, and work drafts need server-side authority.',
  },
  'order-workspaces-v1': {
    layer: 'cloud',
    sensitivity: 'sensitive',
    owner: 'shared-order',
    migrationTarget: 'TencentDB order_workspaces + COS media',
    note: 'Completed-order shared workspaces are visible to both sides and later reviewed before publishing.',
  },
  'order-conversations-v1': {
    layer: 'cloud',
    sensitivity: 'sensitive',
    owner: 'shared-order',
    migrationTarget: 'TencentDB conversations / messages / risk_cases',
    note: 'Order chats may trigger risk review and must be syncable with the admin console.',
  },
  'user-collections-v1': {
    layer: 'cloud',
    sensitivity: 'user',
    owner: 'account-role',
    migrationTarget: 'TencentDB user_likes / user_favorites / user_follows',
    note: 'Likes, favorites, and follows are account data. MVP stores locally under the cloud namespace.',
  },
  'creator-profile-v1': {
    layer: 'cloud',
    sensitivity: 'user',
    owner: 'account-role',
    migrationTarget: 'TencentDB creator_profiles / COS profile_media',
    note: 'Creator profile avatar, display name, and bio are account-owned profile data. MVP stores locally under the cloud namespace.',
  },
  'reviewed-orders-v1': {
    layer: 'local',
    sensitivity: 'device',
    owner: 'account-role',
    migrationTarget: 'Device cache only',
    note: 'UI helper flag for whether this device has already shown a review state.',
  },
  'message-thread-prefs-v1': {
    layer: 'local',
    sensitivity: 'device',
    owner: 'account-role',
    migrationTarget: 'Device cache only',
    note: 'Thread pin, unread, hidden, and deleted preferences are local UI state in the MVP.',
  },
  'wallet-balance-v1': {
    layer: 'cloud',
    sensitivity: 'regulated',
    owner: 'account-role',
    migrationTarget: 'TencentDB wallet_ledger / payment_provider_reconciliation',
    note: 'Balance, income, withdrawal, and settlement records must be admin-confirmed cloud-authoritative data.',
  },
  'admin-audit-cases-v1': {
    layer: 'cloud',
    sensitivity: 'sensitive',
    owner: 'admin',
    migrationTarget: 'TencentDB admin_audit_cases / moderation_cases',
    note: 'Admin review, moderation, reports, disputes, and account status changes are cloud-authoritative.',
  },
};

export function getDataDomainPolicy(key: string) {
  return dataDomainPolicies[key] ?? defaultPolicy;
}

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

export function readDomainJson<T>(key: string, fallback: T, role?: UserRole): T {
  return readScopedJson(key, fallback, role, getDataDomainPolicy(key).layer);
}

export function writeDomainJson<T>(key: string, value: T, role?: UserRole) {
  writeScopedJson(key, value, role, getDataDomainPolicy(key).layer);
}
