import type { UserRole } from '../types/api';
import { readAdminSharedJson, writeAdminSharedJson } from './scopedStorage';

const deletionRequestsStorageKey = 'account-deletion-requests-v1';

export type AccountDeletionRequestStatus = 'pending' | 'processing' | 'resolved';

export type AccountDeletionRequest = {
  id: string;
  phone: string;
  role: Extract<UserRole, 'consumer' | 'companion'>;
  displayName: string;
  reason: string;
  status: AccountDeletionRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export type SubmitAccountDeletionRequestInput = {
  phone: string;
  role: Extract<UserRole, 'consumer' | 'companion'>;
  displayName: string;
  reason?: string;
};

export function listAccountDeletionRequests() {
  return readRequests().sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function submitAccountDeletionRequest(input: SubmitAccountDeletionRequestInput) {
  const requests = readRequests();
  const existing = requests.find((item) => item.phone === input.phone && item.role === input.role && item.status !== 'resolved');
  if (existing) return existing;

  const now = new Date().toISOString();
  const request: AccountDeletionRequest = {
    id: `account-deletion-${input.role}-${input.phone}-${Date.now()}`,
    phone: input.phone,
    role: input.role,
    displayName: input.displayName,
    reason: input.reason || '用户在设置页提交删除账号申请',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  writeRequests([request, ...requests]);
  return request;
}

export function updateAccountDeletionRequestStatus(id: string, status: AccountDeletionRequestStatus) {
  const now = new Date().toISOString();
  const requests = readRequests().map((request) => (request.id === id ? { ...request, status, updatedAt: now } : request));
  writeRequests(requests);
  return requests;
}

function readRequests() {
  return readAdminSharedJson<AccountDeletionRequest[]>(deletionRequestsStorageKey, []).filter(isDeletionRequest);
}

function writeRequests(requests: AccountDeletionRequest[]) {
  writeAdminSharedJson(deletionRequestsStorageKey, requests);
}

function isDeletionRequest(value: unknown): value is AccountDeletionRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Partial<AccountDeletionRequest>;
  return (
    typeof request.id === 'string' &&
    typeof request.phone === 'string' &&
    (request.role === 'consumer' || request.role === 'companion') &&
    typeof request.displayName === 'string' &&
    typeof request.reason === 'string' &&
    (request.status === 'pending' || request.status === 'processing' || request.status === 'resolved') &&
    typeof request.createdAt === 'string' &&
    typeof request.updatedAt === 'string'
  );
}
