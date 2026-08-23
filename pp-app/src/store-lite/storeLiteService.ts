import type {
  ApiResponse,
  AuthSession,
  BookingRequestConsumerDetail,
  BookingRequestConsumerListPage,
  BookingRequestListQuery,
  CancelBookingRequestInput,
  Companion,
  CreateBookingRequestInput,
  FeedPost,
} from '../types/api';
import { clearStoreLiteToken, getStoreLiteToken, setStoreLiteToken, storeLiteGet, storeLitePost } from './storeLiteHttp';

export type StoreLiteFeedPage = {
  items: FeedPost[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type StoreLiteCodeResult = {
  expiresInSeconds: number;
  cooldownSeconds: number;
  testCode?: string;
};

export class StoreLiteApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StoreLiteApiError';
  }
}

export function hasStoreLiteSessionToken() {
  return Boolean(getStoreLiteToken());
}

export async function fetchStoreLiteSession(): Promise<AuthSession | null> {
  if (!hasStoreLiteSessionToken()) return null;
  const response = await storeLiteGet<AuthSession>('/api/auth/session');
  if (!response.success) {
    clearStoreLiteToken();
    return null;
  }
  if (response.data.role !== 'consumer') {
    clearStoreLiteToken();
    throw new StoreLiteApiError('STORE_LITE_CONSUMER_REQUIRED', '当前账号不是消费者身份');
  }
  setStoreLiteToken(response.data.token);
  return response.data;
}

export async function requestStoreLitePhoneCode(phone: string) {
  return unwrap(
    await storeLitePost<StoreLiteCodeResult>('/api/auth/phone/request-code', { phone: normalizePhone(phone) }),
    '验证码发送失败，请稍后重试',
  );
}

export async function verifyStoreLitePhone(phone: string, code: string) {
  const session = unwrap(
    await storeLitePost<AuthSession>('/api/auth/phone/verify', {
      phone: normalizePhone(phone),
      code: code.trim(),
      role: 'consumer',
      intent: 'register',
    }),
    '登录失败，请检查验证码',
  );
  if (session.role !== 'consumer') {
    throw new StoreLiteApiError('STORE_LITE_CONSUMER_REQUIRED', '首发版仅支持消费者身份');
  }
  setStoreLiteToken(session.token);
  return session;
}

export async function logoutStoreLiteSession() {
  try {
    await storeLitePost<{ ok: boolean }>('/api/auth/logout');
  } finally {
    clearStoreLiteToken();
  }
}

export async function fetchStoreLiteFeed(options: { limit?: number; cursor?: string | null; city?: string } = {}) {
  const query = new URLSearchParams({ limit: String(options.limit ?? 20) });
  if (options.cursor) query.set('cursor', options.cursor);
  if (options.city?.trim()) query.set('city', options.city.trim());
  return unwrap(await storeLiteGet<StoreLiteFeedPage>(`/api/feed/posts?${query.toString()}`), '作品加载失败');
}

export async function fetchStoreLitePost(postId: string) {
  return unwrap(await storeLiteGet<FeedPost>(`/api/posts/${encodeURIComponent(postId)}`), '作品加载失败');
}

export async function fetchStoreLitePhotographer(companionId: string) {
  return unwrap(
    await storeLiteGet<Companion>(`/api/companions/${encodeURIComponent(companionId)}`),
    '摄影师资料加载失败',
  );
}

export async function fetchStoreLitePhotographerPosts(companionId: string, cursor?: string | null) {
  const query = new URLSearchParams({ limit: '30' });
  if (cursor) query.set('cursor', cursor);
  return unwrap(
    await storeLiteGet<StoreLiteFeedPage>(`/api/companions/${encodeURIComponent(companionId)}/posts?${query.toString()}`),
    '摄影师作品加载失败',
  );
}

export async function createStoreLiteBooking(input: CreateBookingRequestInput) {
  return unwrap(await storeLitePost<BookingRequestConsumerDetail>('/api/booking-requests', input), '预约申请提交失败');
}

export async function listStoreLiteBookings(query: BookingRequestListQuery = {}) {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  const suffix = params.size ? `?${params.toString()}` : '';
  return unwrap(await storeLiteGet<BookingRequestConsumerListPage>(`/api/booking-requests${suffix}`), '预约记录加载失败');
}

export async function getStoreLiteBooking(bookingRequestId: string) {
  return unwrap(
    await storeLiteGet<BookingRequestConsumerDetail>(`/api/booking-requests/${encodeURIComponent(bookingRequestId)}`),
    '预约详情加载失败',
  );
}

export async function cancelStoreLiteBooking(bookingRequestId: string, input: CancelBookingRequestInput = {}) {
  return unwrap(
    await storeLitePost<BookingRequestConsumerDetail>(`/api/booking-requests/${encodeURIComponent(bookingRequestId)}/cancel`, input),
    '预约取消失败',
  );
}

function unwrap<T>(response: ApiResponse<T>, fallback: string): T {
  if (response.success) return response.data;
  throw new StoreLiteApiError(response.error.code, publicErrorMessage(response.error.code, fallback));
}

function publicErrorMessage(code: string, fallback: string) {
  const normalized = code.trim().toUpperCase();
  if (/AUTH|SESSION|UNAUTHORIZED/.test(normalized)) return '登录已过期，请重新登录';
  if (/PUBLIC_TEXT_UNSAFE/.test(normalized)) return '请勿填写手机号、外部联系方式、链接或付款信息';
  if (/RATE|TOO_MANY|COOLDOWN/.test(normalized)) return '操作过于频繁，请稍后再试';
  if (/CONFLICT|STALE|IDEMPOTENCY/.test(normalized)) return '当前状态已经变化，请刷新后重试';
  if (/NOT_FOUND/.test(normalized)) return '记录不存在或已无法访问';
  if (/POSTGRES|UNAVAILABLE|REQUIRED|INTERNAL|FAILED/.test(normalized)) return '服务暂时繁忙，请稍后重试';
  return fallback;
}

function normalizePhone(phone: string) {
  const normalized = phone.replace(/\D/g, '');
  if (!/^1[3-9]\d{9}$/.test(normalized)) {
    throw new StoreLiteApiError('PHONE_INVALID', '请输入 11 位手机号');
  }
  return normalized;
}
