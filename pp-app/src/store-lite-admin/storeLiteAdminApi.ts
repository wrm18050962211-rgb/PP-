/** Store Lite 运营台专用接口映射；不复用商业 Admin 请求层。 */
import type {
  AdminCancelBookingRequestInput,
  AdminCompleteUserRequestInput,
  AdminDeclineUserRequestInput,
  AdminStartUserRequestInput,
  AuthSession,
  BookingRequestAdminDetail,
  BookingRequestAdminListPage,
  BookingRequestListQuery,
  ConfirmBookingRequestInput,
  ContentReportAdminDetail,
  ContentReportAdminListPage,
  ContentReportAdminListQuery,
  DeclineBookingRequestInput,
  InvestigateContentReportInput,
  RejectContentReportInput,
  ResolveContentReportInput,
  UserRequestAdminDetail,
  UserRequestAdminListPage,
  UserRequestListQuery,
} from '../types/api';
import { adminGet, adminPost, clearAdminToken, getAdminToken, setAdminToken } from './adminHttp';

const allowedAdminScopes = new Set([
  'booking_requests:read',
  'booking_requests:write',
  'user_requests:read',
  'user_requests:write',
  'content_reports:read',
  'content_reports:moderate',
]);

export async function loginAdmin(username: string, password: string) {
  const session = validateAdminSession(
    await adminPost<AuthSession>('/api/admin/auth/login', { username: username.trim(), password }),
  );
  setAdminToken(session.token);
  return session;
}

export async function restoreAdminSession() {
  if (!getAdminToken()) return null;
  const session = validateAdminSession(await adminGet<AuthSession>('/api/auth/session'));
  setAdminToken(session.token);
  return session;
}

export async function logoutAdmin() {
  try {
    if (getAdminToken()) await adminPost<{ ok: boolean }>('/api/admin/auth/logout');
  } finally {
    clearAdminToken();
  }
}

export function listAdminBookings(query: BookingRequestListQuery = {}) {
  return adminGet<BookingRequestAdminListPage>(`/api/admin/booking-requests${buildQuery(query)}`);
}

export function getAdminBooking(id: string) {
  return adminGet<BookingRequestAdminDetail>(`/api/admin/booking-requests/${encodeURIComponent(id)}`);
}

export function confirmAdminBooking(id: string, input: ConfirmBookingRequestInput) {
  return adminPost<BookingRequestAdminDetail>(`/api/admin/booking-requests/${encodeURIComponent(id)}/confirm`, input);
}

export function declineAdminBooking(id: string, input: DeclineBookingRequestInput) {
  return adminPost<BookingRequestAdminDetail>(`/api/admin/booking-requests/${encodeURIComponent(id)}/decline`, input);
}

export function cancelAdminBooking(id: string, input: AdminCancelBookingRequestInput) {
  return adminPost<BookingRequestAdminDetail>(`/api/admin/booking-requests/${encodeURIComponent(id)}/cancel`, input);
}

export function listAdminUserRequests(query: UserRequestListQuery = {}) {
  return adminGet<UserRequestAdminListPage>(`/api/admin/user-requests${buildQuery(query)}`);
}

export function getAdminUserRequest(id: string) {
  return adminGet<UserRequestAdminDetail>(`/api/admin/user-requests/${encodeURIComponent(id)}`);
}

export function startAdminUserRequest(id: string, input: AdminStartUserRequestInput) {
  return adminPost<UserRequestAdminDetail>(`/api/admin/user-requests/${encodeURIComponent(id)}/start`, input);
}

export function completeAdminUserRequest(id: string, input: AdminCompleteUserRequestInput) {
  return adminPost<UserRequestAdminDetail>(`/api/admin/user-requests/${encodeURIComponent(id)}/complete`, input);
}

export function declineAdminUserRequest(id: string, input: AdminDeclineUserRequestInput) {
  return adminPost<UserRequestAdminDetail>(`/api/admin/user-requests/${encodeURIComponent(id)}/decline`, input);
}

export function listAdminContentReports(query: ContentReportAdminListQuery = {}) {
  return adminGet<ContentReportAdminListPage>(`/api/admin/content-reports${buildQuery(query)}`);
}

export function getAdminContentReport(id: string) {
  return adminGet<ContentReportAdminDetail>(`/api/admin/content-reports/${encodeURIComponent(id)}`);
}

export function investigateAdminContentReport(id: string, input: InvestigateContentReportInput) {
  return adminPost<ContentReportAdminDetail>(`/api/admin/content-reports/${encodeURIComponent(id)}/investigate`, input);
}

export function resolveAdminContentReport(id: string, input: ResolveContentReportInput) {
  return adminPost<ContentReportAdminDetail>(`/api/admin/content-reports/${encodeURIComponent(id)}/resolve`, input);
}

export function rejectAdminContentReport(id: string, input: RejectContentReportInput) {
  return adminPost<ContentReportAdminDetail>(`/api/admin/content-reports/${encodeURIComponent(id)}/reject`, input);
}

function validateAdminSession(value: AuthSession) {
  if (
    !value ||
    value.role !== 'admin' ||
    !Array.isArray(value.roles) ||
    !value.roles.includes('admin') ||
    !Array.isArray(value.adminScope) ||
    value.adminScope.some((scope) => typeof scope !== 'string' || !allowedAdminScopes.has(scope)) ||
    typeof value.token !== 'string' ||
    !value.token.trim() ||
    !value.user ||
    typeof value.user.id !== 'string' ||
    value.user.status !== 'active'
  ) {
    clearAdminToken();
    throw new Error('服务端返回的运营会话无效');
  }
  return value;
}

function buildQuery(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === '') continue;
    query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}
