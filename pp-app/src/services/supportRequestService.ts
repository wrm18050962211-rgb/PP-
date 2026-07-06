import type { UserRole } from '../types/api';
import { readAdminSharedJson, writeAdminSharedJson } from './scopedStorage';

const supportRequestsStorageKey = 'support-requests-v1';

export type SupportRequestCategory = 'payment_refund' | 'order_service' | 'safety_report' | 'account' | 'other';
export type SupportRequestStatus = 'pending' | 'processing' | 'resolved';

export type SupportRequest = {
  id: string;
  phone: string;
  role: Extract<UserRole, 'consumer' | 'companion'>;
  displayName: string;
  category: SupportRequestCategory;
  title: string;
  description: string;
  status: SupportRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export type SubmitSupportRequestInput = {
  phone: string;
  role: Extract<UserRole, 'consumer' | 'companion'>;
  displayName: string;
  category: SupportRequestCategory;
  description?: string;
};

const supportCategoryLabels: Record<SupportRequestCategory, string> = {
  payment_refund: '支付退款',
  order_service: '订单服务',
  safety_report: '安全举报',
  account: '账号问题',
  other: '其他问题',
};

export const supportRequestCategoryOptions = Object.entries(supportCategoryLabels).map(([value, label]) => ({
  value: value as SupportRequestCategory,
  label,
}));

export function getSupportRequestCategoryLabel(category: SupportRequestCategory) {
  return supportCategoryLabels[category] ?? '其他问题';
}

export function listSupportRequests() {
  return readRequests().sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function submitSupportRequest(input: SubmitSupportRequestInput) {
  const requests = readRequests();
  const now = new Date().toISOString();
  const title = getSupportRequestCategoryLabel(input.category);
  const request: SupportRequest = {
    id: `support-${input.role}-${input.phone}-${Date.now()}`,
    phone: input.phone,
    role: input.role,
    displayName: input.displayName,
    category: input.category,
    title,
    description: input.description?.trim() || '用户在设置页提交客服请求，等待人工跟进。',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  writeRequests([request, ...requests]);
  return request;
}

export function updateSupportRequestStatus(id: string, status: SupportRequestStatus) {
  const now = new Date().toISOString();
  const requests = readRequests().map((request) => (request.id === id ? { ...request, status, updatedAt: now } : request));
  writeRequests(requests);
  return requests;
}

function readRequests() {
  return readAdminSharedJson<SupportRequest[]>(supportRequestsStorageKey, []).filter(isSupportRequest);
}

function writeRequests(requests: SupportRequest[]) {
  writeAdminSharedJson(supportRequestsStorageKey, requests);
}

function isSupportRequest(value: unknown): value is SupportRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Partial<SupportRequest>;
  return (
    typeof request.id === 'string' &&
    typeof request.phone === 'string' &&
    (request.role === 'consumer' || request.role === 'companion') &&
    typeof request.displayName === 'string' &&
    isSupportCategory(request.category) &&
    typeof request.title === 'string' &&
    typeof request.description === 'string' &&
    (request.status === 'pending' || request.status === 'processing' || request.status === 'resolved') &&
    typeof request.createdAt === 'string' &&
    typeof request.updatedAt === 'string'
  );
}

function isSupportCategory(value: unknown): value is SupportRequestCategory {
  return value === 'payment_refund' || value === 'order_service' || value === 'safety_report' || value === 'account' || value === 'other';
}
