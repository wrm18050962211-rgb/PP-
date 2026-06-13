import type { AuthSession, UserRole } from '../types/api';
import { apiGet, apiPost, isApiEnabled } from './apiClient';
import { findTestAccountByPhone, type PublicRole, type TestAccount } from './accountDirectory';
import { isMiniProgramRuntime, wxLogin } from './miniProgramBridge';

const roleStorageKey = 'pp-auth-role-v1';
const accountStorageKey = 'pp-auth-account-v1';
const loginStorageKey = 'pp-auth-logged-in-v1';
const smsCodeStorageKey = 'pp-auth-sms-code-v1';

type AuthAccount = {
  phone: string;
  role: PublicRole;
  roles: PublicRole[];
  nickname: string;
  creatorId?: string;
  companionId?: string;
  avatarUrl?: string;
  postId?: string;
  registeredAt: string;
};

type SmsCodeRecord = {
  phone: string;
  code: string;
  expiresAt: number;
};

export type RegisterInput = {
  phone: string;
  code: string;
  role: PublicRole;
};

export async function fetchAuthSession(): Promise<AuthSession> {
  if (isAccountLoggedIn()) return localSession(readStoredRole());
  if (!isApiEnabled()) return localSession(readStoredRole());

  try {
    if (isMiniProgramRuntime()) {
      const code = await wxLogin();
      const response = await apiPost<AuthSession>('/api/auth/wechat/login', { code });
      if (response.success) {
        notifySessionChanged(response.data);
        return response.data;
      }
    }

    const response = await apiGet<AuthSession>('/api/auth/session');
    return response.success ? response.data : localSession(readStoredRole());
  } catch {
    return localSession(readStoredRole());
  }
}

export async function switchMockRole(role: UserRole): Promise<AuthSession> {
  const account = readAccount();
  if (!canUseRole(account, role)) return localSession(readStoredRole());

  persistRole(role);
  if (!isApiEnabled()) {
    const session = localSession(role);
    notifySessionChanged(session);
    return session;
  }

  try {
    const response = await apiPost<AuthSession>('/api/auth/wechat/mock-login', { role, companionId: role === 'companion' ? account?.companionId : undefined });
    const session = response.success ? localSession(role) : localSession(role);
    notifySessionChanged(session);
    return session;
  } catch {
    const session = localSession(role);
    notifySessionChanged(session);
    return session;
  }
}

export function hasRegisteredAccount() {
  return Boolean(readAccount());
}

export function isAccountLoggedIn() {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(loginStorageKey) === '1' && hasRegisteredAccount();
}

export function getRegisteredAccount() {
  return readAccount();
}

export function accountHasRole(role: PublicRole) {
  return canUseRole(readAccount(), role);
}

export function getPostAuthHome(role = readStoredRole()) {
  return role === 'companion' ? '/companion/mine' : '/consumer';
}

export function requestPhoneCode(phone: string) {
  const normalizedPhone = normalizePhone(phone);
  if (!isValidPhone(normalizedPhone)) throw new Error('请输入 11 位手机号');

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const record: SmsCodeRecord = {
    phone: normalizedPhone,
    code,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(smsCodeStorageKey, JSON.stringify(record));
  }
  return code;
}

export function registerWithPhone(input: RegisterInput) {
  const phone = normalizePhone(input.phone);
  validatePhoneCode(phone, input.code);

  const account: AuthAccount = {
    phone,
    role: input.role,
    roles: [input.role],
    nickname: input.role === 'companion' ? 'Demo Photographer' : 'Demo Creator',
    registeredAt: new Date().toISOString(),
  };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(accountStorageKey, JSON.stringify(account));
    localStorage.removeItem(loginStorageKey);
  }
  persistRole(input.role);
  return account;
}

export async function loginWithPhoneCode(phone: string, code: string) {
  const normalizedPhone = normalizePhone(phone);
  const account = findLoginAccount(normalizedPhone);
  if (!account) throw new Error('请先完成注册，或使用测试账号清单中的手机号');
  validatePhoneCode(normalizedPhone, code);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(accountStorageKey, JSON.stringify(account));
    localStorage.setItem(loginStorageKey, '1');
  }
  persistRole(account.role);
  return switchMockRole(account.role);
}

export async function logoutAccount() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(loginStorageKey);
  }
  if (isApiEnabled()) {
    try {
      await apiPost('/api/auth/logout');
    } catch {
      // Local logout should still succeed if the mock API is unavailable.
    }
  }
}

export function addRoleToCurrentAccount(role: PublicRole) {
  const account = readAccount();
  if (!account || typeof localStorage === 'undefined') return null;
  const nextAccount: AuthAccount = {
    ...account,
    role,
    roles: Array.from(new Set([...account.roles, role])),
    creatorId: role === 'consumer' ? account.creatorId || `creator-local-${account.phone}` : account.creatorId,
    companionId: role === 'companion' ? account.companionId || 'companion-mori' : account.companionId,
  };
  localStorage.setItem(accountStorageKey, JSON.stringify(nextAccount));
  persistRole(role);
  return nextAccount;
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

function notifySessionChanged(session: AuthSession) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AuthSession>('pp-auth-session-changed', { detail: session }));
}

function isUserRole(role: unknown): role is UserRole {
  return role === 'consumer' || role === 'companion' || role === 'admin';
}

function localSession(role: UserRole): AuthSession {
  const account = readAccount();
  const companionId = role === 'companion' ? account?.companionId || null : null;
  const userId = role === 'consumer' ? account?.creatorId : role === 'companion' ? account?.companionId : null;
  const avatarUrl = role === account?.role ? account?.avatarUrl : '';
  return {
    token: `local-${role}-session`,
    provider: 'mock_wechat',
    role,
    roles: role === 'admin' ? ['consumer', 'companion', 'admin'] : account?.roles ?? (role === 'companion' ? ['companion'] : ['consumer']),
    user: {
      id: userId || `local-${role}-user`,
      openId: `mock-openid-${userId || role}`,
      phone: account?.phone,
      nickname: account?.nickname ?? (role === 'admin' ? 'Demo Admin' : role === 'companion' ? 'Demo Companion' : 'Demo Consumer'),
      avatarUrl,
      gender: 'unknown',
      city: 'Shanghai',
      status: 'active',
      isCompanion: role === 'companion',
      roles: role === 'admin' ? ['consumer', 'companion', 'admin'] : account?.roles ?? (role === 'companion' ? ['companion'] : ['consumer']),
    },
    companionId,
    adminScope: role === 'admin' ? ['audit', 'orders', 'risk', 'finance'] : [],
    loginAt: new Date().toISOString(),
  };
}

function findLoginAccount(phone: string): AuthAccount | null {
  const testAccount = findTestAccountByPhone(phone);
  if (testAccount) return mapTestAccount(testAccount);
  const account = readAccount();
  return account?.phone === phone ? account : null;
}

function mapTestAccount(account: TestAccount): AuthAccount {
  return {
    phone: account.phone,
    role: account.defaultRole,
    roles: account.roles,
    nickname: account.name,
    creatorId: account.creatorId,
    companionId: account.companionId,
    avatarUrl: account.avatar,
    postId: account.postId,
    registeredAt: new Date().toISOString(),
  };
}

function readAccount(): AuthAccount | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(accountStorageKey);
    if (!raw) return null;
    const account = JSON.parse(raw) as Partial<AuthAccount>;
    if (!account.phone || (account.role !== 'consumer' && account.role !== 'companion')) return null;
    const roles = normalizeRoles(account.roles, account.role);
    return {
      phone: account.phone,
      role: account.role,
      roles,
      nickname: account.nickname || (account.role === 'companion' ? 'Demo Photographer' : 'Demo Creator'),
      creatorId: account.creatorId,
      companionId: account.companionId,
      avatarUrl: account.avatarUrl,
      postId: account.postId,
      registeredAt: account.registeredAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function canUseRole(account: AuthAccount | null, role: UserRole) {
  if (role === 'admin') return false;
  if (!account) return false;
  return account.roles.includes(role);
}

function normalizeRoles(roles: unknown, fallbackRole: PublicRole): PublicRole[] {
  if (!Array.isArray(roles)) return [fallbackRole];
  const nextRoles = roles.filter((role): role is PublicRole => role === 'consumer' || role === 'companion');
  return nextRoles.length ? Array.from(new Set(nextRoles)) : [fallbackRole];
}

function validatePhoneCode(phone: string, code: string) {
  if (!isValidPhone(phone)) throw new Error('请输入 11 位手机号');
  if (!/^\d{6}$/.test(code)) throw new Error('请输入 6 位验证码');

  const record = readSmsCode();
  if (!record || record.phone !== phone || record.code !== code || record.expiresAt < Date.now()) {
    throw new Error('验证码错误或已过期');
  }
}

function readSmsCode(): SmsCodeRecord | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(smsCodeStorageKey);
    return raw ? (JSON.parse(raw) as SmsCodeRecord) : null;
  } catch {
    return null;
  }
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '').slice(0, 11);
}

function isValidPhone(phone: string) {
  return /^1\d{10}$/.test(phone);
}
