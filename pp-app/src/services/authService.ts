import type { AuthSession, UserRole } from '../types/api';
import { apiGet, apiPost, isApiEnabled, isMockRuntimeAllowed, isProductionRuntime, useMockFallback } from './apiClient';
import { findTestAccountIdentitiesByPhone, type PublicRole, type TestAccountIdentity } from './accountDirectory';
import { isMiniProgramRuntime, wxLogin } from './miniProgramBridge';

const roleStorageKey = 'pp-auth-role-v1';
const accountStorageKey = 'pp-auth-account-v1';
const loginStorageKey = 'pp-auth-logged-in-v1';
const smsCodeStorageKey = 'pp-auth-sms-code-v1';

type AuthAccount = {
  phone: string;
  role: PublicRole;
  roles: PublicRole[];
  completedRoleRegistrations?: PublicRole[];
  pendingRoleRegistrations?: PublicRole[];
  roleReviewStatus?: Partial<Record<PublicRole, 'draft' | 'pending' | 'approved' | 'rejected'>>;
  nickname: string;
  creatorName?: string;
  photographerName?: string;
  creatorId?: string;
  companionId?: string;
  creatorAvatarUrl?: string;
  photographerAvatarUrl?: string;
  creatorPostId?: string;
  photographerPostId?: string;
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

export class MissingRoleRegistrationError extends Error {
  constructor(public readonly role: PublicRole) {
    super(`该手机号尚未注册${role === 'companion' ? '摄影师' : '创作者'}身份`);
    this.name = 'MissingRoleRegistrationError';
  }
}

export class PendingRoleReviewError extends Error {
  constructor(public readonly role: PublicRole) {
    super(`${role === 'companion' ? '摄影师' : '创作者'}身份正在审核中，审核通过后才能登录该身份`);
    this.name = 'PendingRoleReviewError';
  }
}

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
  if (isProductionRuntime()) throw new Error('生产环境不能使用 mock 身份切换，请接入真实登录会话。');

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
  const account = readAccount();
  if (!account) return false;
  return getUsableRoles(account).includes(role);
}

export function getAvailableLoginRoles(phone?: string): PublicRole[] {
  const normalizedPhone = normalizePhone(phone ?? '');
  const testRoles = isMockRuntimeAllowed() && normalizedPhone ? findTestAccountIdentitiesByPhone(normalizedPhone).map((identity) => identity.role) : [];
  if (testRoles.length) return Array.from(new Set(testRoles));
  const account = readAccount();
  if (!account || (normalizedPhone && account.phone !== normalizedPhone)) return [];
  return getUsableRoles(account);
}

export function getPostAuthHome(role = readStoredRole()) {
  const account = readAccount();
  if (account && role !== 'admin' && account.role === role && !getUsableRoles(account).includes(role)) {
    return role === 'companion' ? '/companion/onboarding' : '/consumer/onboarding';
  }
  return role === 'companion' ? '/companion/mine' : '/consumer';
}

export function requestPhoneCode(phone: string) {
  if (isProductionRuntime()) throw new Error('生产环境需要接入真实短信验证码接口，不能使用本地测试验证码。');

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
  const existing = readAccount()?.phone === phone ? readAccount() : null;
  const existingStatus = existing?.roleReviewStatus?.[input.role];
  if (existingStatus === 'pending') throw new PendingRoleReviewError(input.role);

  const alreadyApproved = existingStatus === 'approved' || (existing ? getUsableRoles(existing).includes(input.role) : false);
  const shouldApproveImmediately = input.role === 'consumer' || alreadyApproved;
  const approvedRoles = existing ? getApprovedLocalRoles(existing) : [];
  const roles = shouldApproveImmediately ? Array.from(new Set([...approvedRoles, input.role])) : approvedRoles;
  const pendingRoleRegistrations = shouldApproveImmediately
    ? (existing?.pendingRoleRegistrations ?? []).filter((role) => role !== input.role)
    : (existing?.pendingRoleRegistrations ?? []).filter((role) => role !== input.role);
  const completedRoleRegistrations = shouldApproveImmediately
    ? Array.from(new Set([...(existing?.completedRoleRegistrations ?? []), input.role]))
    : (existing?.completedRoleRegistrations ?? []).filter((role) => role !== input.role);
  const roleReviewStatus = { ...(existing?.roleReviewStatus ?? {}), [input.role]: shouldApproveImmediately ? 'approved' as const : 'draft' as const };

  const account: AuthAccount = {
    ...existing,
    phone,
    role: input.role,
    roles,
    completedRoleRegistrations,
    pendingRoleRegistrations,
    roleReviewStatus,
    nickname: input.role === 'companion' ? 'Demo Photographer' : 'Demo Creator',
    creatorName: input.role === 'consumer' ? existing?.creatorName || 'Demo Creator' : existing?.creatorName,
    photographerName: input.role === 'companion' ? existing?.photographerName || 'Demo Photographer' : existing?.photographerName,
    creatorId: input.role === 'consumer' ? existing?.creatorId || `creator-local-${phone}` : existing?.creatorId,
    companionId: input.role === 'companion' ? existing?.companionId || `companion-local-${phone}` : existing?.companionId,
    registeredAt: new Date().toISOString(),
  };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(accountStorageKey, JSON.stringify(account));
    if (shouldApproveImmediately) {
      localStorage.setItem(loginStorageKey, '1');
    } else {
      localStorage.removeItem(loginStorageKey);
    }
  }
  persistRole(input.role);
  notifySessionChanged(localSession(input.role));
  return account;
}

export async function loginWithPhoneCode(phone: string, code: string, role?: PublicRole) {
  const normalizedPhone = normalizePhone(phone);
  if (!isValidPhone(normalizedPhone)) throw new Error('请输入 11 位手机号');
  const account = findLoginAccount(normalizedPhone);
  if (!account) throw new MissingRoleRegistrationError(role ?? 'consumer');
  const availableRoles = getUsableRoles(account);
  const loginRole = role ?? account.role;
  if (!availableRoles.includes(loginRole)) {
    if (account.roleReviewStatus?.[loginRole] === 'pending') throw new PendingRoleReviewError(loginRole);
    throw new MissingRoleRegistrationError(loginRole);
  }
  validatePhoneCode(normalizedPhone, code);

  const nextAccount = { ...account, role: loginRole };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(accountStorageKey, JSON.stringify(nextAccount));
    localStorage.setItem(loginStorageKey, '1');
  }
  persistRole(loginRole);
  return switchMockRole(loginRole);
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
  return completeRoleRegistration(role);
}

export function markRoleRegistrationPending(role: PublicRole) {
  const account = readAccount();
  if (!account || typeof localStorage === 'undefined') return null;
  const nextAccount: AuthAccount = {
    ...account,
    pendingRoleRegistrations: Array.from(new Set([...(account.pendingRoleRegistrations ?? []), role])),
    roleReviewStatus: { ...(account.roleReviewStatus ?? {}), [role]: 'pending' },
  };
  localStorage.setItem(accountStorageKey, JSON.stringify(nextAccount));
  return nextAccount;
}

export function completeRoleRegistration(role: PublicRole, profile: Partial<Pick<AuthAccount, 'creatorName' | 'photographerName' | 'creatorAvatarUrl' | 'photographerAvatarUrl'>> = {}) {
  const account = readAccount();
  if (!account || typeof localStorage === 'undefined') return null;
  const completedRoleRegistrations = Array.from(new Set([...(account.completedRoleRegistrations ?? []), role]));
  const pendingRoleRegistrations = (account.pendingRoleRegistrations ?? []).filter((item) => item !== role);
  const nextAccount: AuthAccount = {
    ...account,
    ...profile,
    role: account.role,
    roles: Array.from(new Set([...getUsableRoles(account), role])),
    completedRoleRegistrations,
    pendingRoleRegistrations,
    roleReviewStatus: { ...(account.roleReviewStatus ?? {}), [role]: 'approved' },
    creatorId: role === 'consumer' ? account.creatorId || `creator-local-${account.phone}` : account.creatorId,
    companionId: role === 'companion' ? account.companionId || `companion-local-${account.phone}` : account.companionId,
    creatorName: profile.creatorName ?? (role === 'consumer' ? account.creatorName || 'Demo Creator' : account.creatorName),
    photographerName: profile.photographerName ?? (role === 'companion' ? account.photographerName || 'Demo Photographer' : account.photographerName),
  };
  localStorage.setItem(accountStorageKey, JSON.stringify(nextAccount));
  return nextAccount;
}

export function getActiveAccountStorageScope(role: UserRole = readStoredRole()) {
  const account = readAccount();
  if (!account) return `guest:${role}`;
  const identityId = role === 'companion' ? account.companionId || 'unregistered-companion' : account.creatorId || 'unregistered-creator';
  return `${account.phone}:${role}:${identityId}`;
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
  if (isProductionRuntime()) return useMockFallback({} as AuthSession, 'local auth session');

  const account = readAccount();
  const activeRole = resolveUsableRole(account, role);
  if (activeRole !== role) persistRole(activeRole);
  const companionId = activeRole === 'companion' ? account?.companionId || null : null;
  const userId = activeRole === 'consumer' ? account?.creatorId : activeRole === 'companion' ? account?.companionId : null;
  const nickname =
    activeRole === 'consumer'
      ? account?.creatorName || account?.nickname
      : activeRole === 'companion'
        ? account?.photographerName || account?.nickname
        : account?.nickname;
  const avatarUrl = activeRole === 'consumer' ? account?.creatorAvatarUrl || '' : activeRole === 'companion' ? account?.photographerAvatarUrl || '' : '';
  return {
    token: `local-${activeRole}-session`,
    provider: 'mock_wechat',
    role: activeRole,
    roles: activeRole === 'admin' ? ['consumer', 'companion', 'admin'] : account ? getUsableRoles(account) : activeRole === 'companion' ? ['companion'] : ['consumer'],
    user: {
      id: userId || `local-${activeRole}-user`,
      openId: `mock-openid-${userId || activeRole}`,
      phone: account?.phone,
      nickname: nickname ?? (activeRole === 'admin' ? 'Demo Admin' : activeRole === 'companion' ? 'Demo Companion' : 'Demo Consumer'),
      avatarUrl,
      gender: 'unknown',
      city: 'Shanghai',
      status: 'active',
      isCompanion: activeRole === 'companion',
      roles: activeRole === 'admin' ? ['consumer', 'companion', 'admin'] : account ? getUsableRoles(account) : activeRole === 'companion' ? ['companion'] : ['consumer'],
    },
    companionId,
    adminScope: activeRole === 'admin' ? ['audit', 'orders', 'risk', 'finance'] : [],
    loginAt: new Date().toISOString(),
  };
}

function findLoginAccount(phone: string): AuthAccount | null {
  const testIdentities = isMockRuntimeAllowed() ? findTestAccountIdentitiesByPhone(phone) : [];
  const account = readAccount();
  if (testIdentities.length) {
    const testAccount = mapTestIdentities(testIdentities);
    return account?.phone === phone ? mergeLoginAccounts(testAccount, account) : testAccount;
  }
  return account?.phone === phone ? account : null;
}

function mergeLoginAccounts(testAccount: AuthAccount, localAccount: AuthAccount): AuthAccount {
  const localApprovedRoles = getApprovedLocalRoles(localAccount);
  return {
    ...testAccount,
    role: localAccount.role ?? testAccount.role,
    roles: Array.from(new Set([...testAccount.roles, ...localApprovedRoles])),
    completedRoleRegistrations: Array.from(new Set([...(testAccount.completedRoleRegistrations ?? []), ...localApprovedRoles])),
    pendingRoleRegistrations: Array.from(new Set([...(testAccount.pendingRoleRegistrations ?? []), ...(localAccount.pendingRoleRegistrations ?? [])])),
    roleReviewStatus: { ...(testAccount.roleReviewStatus ?? {}), ...(localAccount.roleReviewStatus ?? {}) },
    nickname: localAccount.nickname || testAccount.nickname,
    creatorName: localAccount.creatorName ?? testAccount.creatorName,
    photographerName: localAccount.photographerName ?? testAccount.photographerName,
    creatorId: localAccount.creatorId ?? testAccount.creatorId,
    companionId: localAccount.companionId ?? testAccount.companionId,
    creatorAvatarUrl: localAccount.creatorAvatarUrl ?? testAccount.creatorAvatarUrl,
    photographerAvatarUrl: localAccount.photographerAvatarUrl ?? testAccount.photographerAvatarUrl,
    creatorPostId: localAccount.creatorPostId ?? testAccount.creatorPostId,
    photographerPostId: localAccount.photographerPostId ?? testAccount.photographerPostId,
    registeredAt: localAccount.registeredAt || testAccount.registeredAt,
  };
}

function mapTestIdentities(identities: TestAccountIdentity[]): AuthAccount {
  const creator = identities.find((account) => account.role === 'consumer');
  const photographer = identities.find((account) => account.role === 'companion');
  const defaultRole = creator ? 'consumer' : 'companion';
  return {
    phone: identities[0].phone,
    role: defaultRole,
    roles: identities.map((account) => account.role),
    completedRoleRegistrations: [],
    pendingRoleRegistrations: [],
    roleReviewStatus: Object.fromEntries(identities.map((account) => [account.role, 'approved'])),
    nickname: (defaultRole === 'consumer' ? creator?.name : photographer?.name) || identities[0].name,
    creatorName: creator?.name,
    photographerName: photographer?.name,
    creatorId: creator?.creatorId,
    companionId: photographer?.companionId,
    creatorAvatarUrl: creator?.avatar,
    photographerAvatarUrl: photographer?.avatar,
    creatorPostId: creator?.postId,
    photographerPostId: photographer?.postId,
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
    const roleReviewStatus = normalizeRoleReviewStatus(account.roleReviewStatus);
    const roles = normalizeRoles(account.roles, account.role).filter((role) => roleReviewStatus[role] !== 'draft' && roleReviewStatus[role] !== 'pending');
    const sanitized = sanitizeLegacyAccount({
      phone: account.phone,
      role: account.role,
      roles,
      completedRoleRegistrations: normalizeOptionalRoles(account.completedRoleRegistrations),
      pendingRoleRegistrations: normalizeOptionalRoles(account.pendingRoleRegistrations),
      roleReviewStatus,
      nickname: account.nickname || (account.role === 'companion' ? 'Demo Photographer' : 'Demo Creator'),
      creatorName: account.creatorName,
      photographerName: account.photographerName,
      creatorId: account.creatorId,
      companionId: account.companionId,
      creatorAvatarUrl: account.creatorAvatarUrl,
      photographerAvatarUrl: account.photographerAvatarUrl,
      creatorPostId: account.creatorPostId,
      photographerPostId: account.photographerPostId,
      registeredAt: account.registeredAt || new Date().toISOString(),
    });
    if (raw !== JSON.stringify(sanitized)) localStorage.setItem(accountStorageKey, JSON.stringify(sanitized));
    return sanitized;
  } catch {
    return null;
  }
}

function canUseRole(account: AuthAccount | null, role: UserRole) {
  if (role === 'admin') return false;
  if (!account) return false;
  return getUsableRoles(account).includes(role);
}

function getUsableRoles(account: AuthAccount): PublicRole[] {
  const testRoles = findTestAccountIdentitiesByPhone(account.phone).map((identity) => identity.role);
  return Array.from(new Set([...testRoles, ...getApprovedLocalRoles(account)]));
}

function getApprovedLocalRoles(account: AuthAccount): PublicRole[] {
  return Array.from(
    new Set(
      [...account.roles, ...(account.completedRoleRegistrations ?? [])].filter((role) => {
        const status = account.roleReviewStatus?.[role];
        return status !== 'draft' && status !== 'pending' && status !== 'rejected';
      }),
    ),
  );
}

function resolveUsableRole(account: AuthAccount | null, role: UserRole): UserRole {
  if (role === 'admin' || !account) return role;
  const usableRoles = getUsableRoles(account);
  return usableRoles.includes(role) ? role : usableRoles[0] ?? account.role;
}

function normalizeRoles(roles: unknown, fallbackRole: PublicRole): PublicRole[] {
  if (!Array.isArray(roles)) return [fallbackRole];
  const nextRoles = roles.filter((role): role is PublicRole => role === 'consumer' || role === 'companion');
  return Array.from(new Set(nextRoles));
}

function normalizeOptionalRoles(roles: unknown): PublicRole[] {
  if (!Array.isArray(roles)) return [];
  return Array.from(new Set(roles.filter((role): role is PublicRole => role === 'consumer' || role === 'companion')));
}

function normalizeRoleReviewStatus(status: unknown): Partial<Record<PublicRole, 'draft' | 'pending' | 'approved' | 'rejected'>> {
  if (!status || typeof status !== 'object') return {};
  const record = status as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [PublicRole, 'draft' | 'pending' | 'approved' | 'rejected'] =>
        (entry[0] === 'consumer' || entry[0] === 'companion') &&
        (entry[1] === 'draft' || entry[1] === 'pending' || entry[1] === 'approved' || entry[1] === 'rejected'),
    ),
  );
}

function sanitizeLegacyAccount(account: AuthAccount): AuthAccount {
  if (!['13910010001', '13910010002'].includes(account.phone)) return account;
  const companionStatus = account.roleReviewStatus?.companion;
  const keepCompanionReview = companionStatus === 'draft' || companionStatus === 'pending';
  const roles = account.roles.filter((role) => role !== 'companion');
  const completedRoleRegistrations = (account.completedRoleRegistrations ?? []).filter((role) => role !== 'companion');
  const pendingRoleRegistrations = keepCompanionReview
    ? account.pendingRoleRegistrations ?? []
    : (account.pendingRoleRegistrations ?? []).filter((role) => role !== 'companion');
  const roleReviewStatus = { ...(account.roleReviewStatus ?? {}) };
  if (!keepCompanionReview) delete roleReviewStatus.companion;
  return {
    ...account,
    role: account.role === 'companion' && !keepCompanionReview ? roles[0] ?? 'consumer' : account.role,
    roles,
    completedRoleRegistrations,
    pendingRoleRegistrations,
    roleReviewStatus,
    photographerName: keepCompanionReview ? account.photographerName : undefined,
    companionId: keepCompanionReview ? account.companionId : undefined,
    photographerAvatarUrl: keepCompanionReview ? account.photographerAvatarUrl : undefined,
    photographerPostId: keepCompanionReview ? account.photographerPostId : undefined,
  };
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
