import type { AuthSession, UserRole } from '../types/api';
import { apiGet, apiPost, isApiEnabled } from './apiClient';

const roleStorageKey = 'pp-auth-role-v1';

export async function fetchAuthSession(): Promise<AuthSession> {
  if (!isApiEnabled()) return localSession(readStoredRole());

  try {
    const response = await apiGet<AuthSession>('/api/auth/session');
    return response.success ? response.data : localSession(readStoredRole());
  } catch {
    return localSession(readStoredRole());
  }
}

export async function switchMockRole(role: UserRole): Promise<AuthSession> {
  persistRole(role);
  if (!isApiEnabled()) return localSession(role);

  try {
    const response = await apiPost<AuthSession>('/api/auth/wechat/mock-login', { role });
    return response.success ? response.data : localSession(role);
  } catch {
    return localSession(role);
  }
}

function readStoredRole(): UserRole {
  if (typeof localStorage === 'undefined') return 'consumer';
  const role = localStorage.getItem(roleStorageKey);
  return isUserRole(role) ? role : 'consumer';
}

function persistRole(role: UserRole) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(roleStorageKey, role);
}

function isUserRole(role: unknown): role is UserRole {
  return role === 'consumer' || role === 'companion' || role === 'admin';
}

function localSession(role: UserRole): AuthSession {
  return {
    token: `local-${role}-session`,
    provider: 'mock_wechat',
    role,
    roles: role === 'admin' ? ['consumer', 'companion', 'admin'] : role === 'companion' ? ['consumer', 'companion'] : ['consumer'],
    user: {
      id: `local-${role}-user`,
      openId: `mock-openid-${role}`,
      nickname: role === 'admin' ? 'Demo Admin' : role === 'companion' ? 'Demo Companion' : 'Demo Consumer',
      avatarUrl: '',
      gender: 'unknown',
      city: 'Shanghai',
      status: 'active',
      isCompanion: role === 'companion',
      roles: role === 'admin' ? ['consumer', 'companion', 'admin'] : role === 'companion' ? ['consumer', 'companion'] : ['consumer'],
    },
    companionId: role === 'companion' ? 'companion-mori' : null,
    adminScope: role === 'admin' ? ['audit', 'orders', 'risk', 'finance'] : [],
    loginAt: new Date().toISOString(),
  };
}
