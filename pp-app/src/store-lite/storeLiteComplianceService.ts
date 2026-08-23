import type {
  BlockedCompanion,
  BlockedCompanionListPage,
  BlockedCompanionListQuery,
  BlockedCompanionMutationResult,
  CancelUserRequestInput,
  ContentReportConsumerDetail,
  ContentReportConsumerListPage,
  ContentReportListQuery,
  CreateContentReportInput,
  CreateUserRequestInput,
  UserRequestConsumerDetail,
  UserRequestConsumerListPage,
  UserRequestListQuery,
} from '../types/api';
import { storeLiteDelete, storeLiteGet, storeLitePost, storeLitePut } from './storeLiteHttp';

const requestIdStoragePrefix = 'pp-store-lite-compliance-request-id-v1:';
const memoryRequestIds = new Map<string, string>();

export class StoreLiteComplianceApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'StoreLiteComplianceApiError';
  }
}

export async function createStoreLiteUserRequest(input: CreateUserRequestInput) {
  return unwrap(await storeLitePost<UserRequestConsumerDetail>('/api/user-requests', input), '请求提交失败，请稍后重试');
}

export async function listStoreLiteUserRequests(query: UserRequestListQuery = {}) {
  return unwrap(
    await storeLiteGet<UserRequestConsumerListPage>(`/api/user-requests${querySuffix(query)}`),
    '请求记录加载失败，请稍后重试',
  );
}

export async function getStoreLiteUserRequest(userRequestId: string) {
  return unwrap(
    await storeLiteGet<UserRequestConsumerDetail>(`/api/user-requests/${encodeURIComponent(userRequestId)}`),
    '请求详情加载失败，请稍后重试',
  );
}

export async function cancelStoreLiteUserRequest(userRequestId: string, input: CancelUserRequestInput = {}) {
  return unwrap(
    await storeLitePost<UserRequestConsumerDetail>(`/api/user-requests/${encodeURIComponent(userRequestId)}/cancel`, input),
    '取消请求失败，请稍后重试',
  );
}

export async function createStoreLiteContentReport(input: CreateContentReportInput) {
  return unwrap(
    await storeLitePost<ContentReportConsumerDetail>('/api/content-reports', input),
    '举报提交失败，请稍后重试',
  );
}

export async function listMyStoreLiteContentReports(query: ContentReportListQuery = {}) {
  return unwrap(
    await storeLiteGet<ContentReportConsumerListPage>(`/api/me/content-reports${querySuffix(query)}`),
    '举报记录加载失败，请稍后重试',
  );
}

export async function getMyStoreLiteContentReport(contentReportId: string) {
  return unwrap(
    await storeLiteGet<ContentReportConsumerDetail>(`/api/me/content-reports/${encodeURIComponent(contentReportId)}`),
    '举报详情加载失败，请稍后重试',
  );
}

export async function listStoreLiteBlockedCompanions(query: BlockedCompanionListQuery = {}) {
  return unwrap(
    await storeLiteGet<BlockedCompanionListPage>(`/api/me/blocked-companions${querySuffix(query)}`),
    '屏蔽列表加载失败，请稍后重试',
  );
}

export async function blockStoreLiteCompanion(companionId: string) {
  return unwrap(
    await storeLitePut<BlockedCompanion>(`/api/me/blocked-companions/${encodeURIComponent(companionId)}`),
    '屏蔽失败，请稍后重试',
  );
}

export async function unblockStoreLiteCompanion(companionId: string) {
  return unwrap(
    await storeLiteDelete<BlockedCompanionMutationResult>(`/api/me/blocked-companions/${encodeURIComponent(companionId)}`),
    '解除屏蔽失败，请稍后重试',
  );
}

/**
 * A workflow keeps one ID in sessionStorage until its authoritative create call
 * succeeds. Network retries therefore replay the same table-level idempotency key.
 */
export function getOrCreateStoreLiteComplianceRequestId(workflow: string) {
  const key = requestIdStorageKey(workflow);
  const stored = readSessionValue(key) || memoryRequestIds.get(key);
  if (stored) return stored;
  const requestId = createRequestId();
  memoryRequestIds.set(key, requestId);
  writeSessionValue(key, requestId);
  return requestId;
}

export function clearStoreLiteComplianceRequestId(workflow: string) {
  const key = requestIdStorageKey(workflow);
  memoryRequestIds.delete(key);
  removeSessionValue(key);
}

function unwrap<T>(response: Awaited<ReturnType<typeof storeLiteGet<T>>>, fallback: string): T {
  if (response.success) return response.data;
  throw new StoreLiteComplianceApiError(
    response.error.code,
    complianceErrorMessage(response.error.code, fallback),
    response.error.requestId,
  );
}

function complianceErrorMessage(code: string, fallback: string) {
  const messages: Record<string, string> = {
    AUTH_REQUIRED: '登录已过期，请重新登录后继续',
    FORBIDDEN: '当前账号无法执行此操作',
    NOT_FOUND: '当前功能暂未开放，请稍后再试',
    USER_REQUEST_INVALID: '请求内容不完整或格式不正确，请检查后重试',
    USER_REQUEST_QUERY_INVALID: '请求记录筛选条件无效，请刷新后重试',
    USER_REQUEST_CURSOR_INVALID: '请求记录已更新，请返回第一页重新加载',
    USER_REQUEST_NOT_FOUND: '这条请求不存在或已不可查看',
    USER_REQUEST_BOOKING_NOT_FOUND: '关联预约不存在或不属于当前账号',
    USER_REQUEST_IDEMPOTENCY_CONFLICT: '这次提交可能已经成功，请先刷新请求记录确认',
    USER_REQUEST_STATUS_CONFLICT: '请求状态已经变化，请刷新后再操作',
    CONTENT_REPORT_INVALID: '举报内容不完整或格式不正确，请检查后重试',
    CONTENT_REPORT_QUERY_INVALID: '举报记录筛选条件无效，请刷新后重试',
    CONTENT_REPORT_CURSOR_INVALID: '举报记录已更新，请返回第一页重新加载',
    CONTENT_REPORT_NOT_FOUND: '这条举报不存在或已不可查看',
    CONTENT_REPORT_TARGET_NOT_FOUND: '该作品或摄影师当前不可举报',
    CONTENT_REPORT_IDEMPOTENCY_CONFLICT: '这次举报可能已经提交，请先刷新举报记录确认',
    CONTENT_REPORT_STATUS_CONFLICT: '举报状态已经变化，请刷新后再查看',
    COMPANION_BLOCK_QUERY_INVALID: '屏蔽列表参数无效，请刷新后重试',
    COMPANION_BLOCK_CURSOR_INVALID: '屏蔽列表已更新，请返回第一页重新加载',
    COMPANION_BLOCK_TARGET_NOT_FOUND: '该摄影师不存在或当前不可屏蔽',
    RATE_LIMITED: '操作过于频繁，请稍后再试',
    SENSITIVE_RATE_LIMITED: '操作过于频繁，请稍后再试',
    COMPLIANCE_POSTGRES_REQUIRED: '客服与安全服务暂不可用，请稍后重试',
    COMPLIANCE_STORE_UNAVAILABLE: '客服与安全服务暂不可用，请稍后重试',
  };
  return messages[code] || fallback;
}

function querySuffix(query: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  return params.size ? `?${params.toString()}` : '';
}

function requestIdStorageKey(workflow: string) {
  const normalized = String(workflow || 'default')
    .trim()
    .replace(/[^a-zA-Z0-9:._-]/g, '-')
    .slice(0, 200);
  return `${requestIdStoragePrefix}${normalized || 'default'}`;
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `ios-compliance-${crypto.randomUUID()}`;
  return `ios-compliance-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function readSessionValue(key: string) {
  try {
    return typeof sessionStorage === 'undefined' ? '' : String(sessionStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
}

function writeSessionValue(key: string, value: string) {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, value);
  } catch {
    // The in-memory copy still keeps retries stable when storage is unavailable.
  }
}

function removeSessionValue(key: string) {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key);
  } catch {
    // The in-memory copy has already been cleared.
  }
}
