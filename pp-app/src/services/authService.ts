import type { AuthSession, UserRole } from '../types/api';
import { apiGet, apiPost, isApiEnabled } from './apiClient';
import { isMiniProgramRuntime, wxLogin } from './miniProgramBridge';

const roleStorageKey = 'pp-auth-role-v1';
const accountStorageKey = 'pp-auth-account-v1';
const loginStorageKey = 'pp-auth-logged-in-v1';
const smsCodeStorageKey = 'pp-auth-sms-code-v1';

type AuthAccount = {
  phone: string;
  role: Extract<UserRole, 'consumer' | 'companion'>;
  nickname: string;
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
  role: Extract<UserRole, 'consumer' | 'companion'>;
};

export async function fetchAuthSession(): Promise<AuthSession> {
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
  persistRole(role);
  if (!isApiEnabled()) {
    const session = localSession(role);
    notifySessionChanged(session);
    return session;
  }

  try {
    const response = await apiPost<AuthSession>('/api/auth/wechat/mock-login', { role });
    const session = response.success ? response.data : localSession(role);
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
  const account = readAccount();
  const normalizedPhone = normalizePhone(phone);
  if (!account) throw new Error('请先完成注册');
  if (account.phone !== normalizedPhone) throw new Error('手机号与注册账号不一致');
  validatePhoneCode(normalizedPhone, code);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(loginStorageKey, '1');
  }
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
  return {
    token: `local-${role}-session`,
    provider: 'mock_wechat',
    role,
    roles: role === 'admin' ? ['consumer', 'companion', 'admin'] : role === 'companion' ? ['consumer', 'companion'] : ['consumer'],
    user: {
      id: `local-${role}-user`,
      openId: `mock-openid-${role}`,
      phone: account?.phone,
      nickname: account?.nickname ?? (role === 'admin' ? 'Demo Admin' : role === 'companion' ? 'Demo Companion' : 'Demo Consumer'),
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

function readAccount(): AuthAccount | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(accountStorageKey);
    if (!raw) return null;
    const account = JSON.parse(raw) as Partial<AuthAccount>;
    if (!account.phone || (account.role !== 'consumer' && account.role !== 'companion')) return null;
    return {
      phone: account.phone,
      role: account.role,
      nickname: account.nickname || (account.role === 'companion' ? 'Demo Photographer' : 'Demo Creator'),
      registeredAt: account.registeredAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
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
