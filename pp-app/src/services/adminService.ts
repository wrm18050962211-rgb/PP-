import { adminDashboard } from '../data/mockApi';
import type { AdminDashboardData, AppOrder, CompanionApplication, PublishedWorkDraft } from '../types/api';
import { apiGet, apiPost, isApiEnabled } from './apiClient';

export function getAdminDashboardData(application: CompanionApplication, workDraft: PublishedWorkDraft, orders: AppOrder[]): AdminDashboardData {
  return {
    metrics: [
      { label: '待审核陪拍者', value: application.reviewStatus === '待审核' ? '1' : '0' },
      { label: '待审作品', value: workDraft.reviewStatus === '待审核' ? '1' : '0' },
      { label: '订单总数', value: String(orders.length) },
      { label: '风控拦截', value: adminDashboard.metrics.find((metric) => metric.label === '风控拦截')?.value ?? '0' },
    ],
    moduleCards: adminDashboard.moduleCards,
  };
}

export async function fetchAdminDashboardData(application: CompanionApplication, workDraft: PublishedWorkDraft, orders: AppOrder[]): Promise<AdminDashboardData> {
  const fallback = getAdminDashboardData(application, workDraft, orders);
  if (!isApiEnabled()) return fallback;

  try {
    const response = await apiGet<AdminDashboardData>('/api/admin/dashboard');
    return response.success ? response.data : fallback;
  } catch {
    return fallback;
  }
}

export async function approveAuditCase(caseId: string) {
  if (!isApiEnabled()) return true;

  try {
    const response = await apiPost<{ ok: boolean }>(`/api/admin/audit-cases/${caseId}/approve`);
    return response.success;
  } catch {
    return false;
  }
}

export async function rejectAuditCase(caseId: string, reason: string) {
  if (!isApiEnabled()) return true;

  try {
    const response = await apiPost<{ ok: boolean }>(`/api/admin/audit-cases/${caseId}/reject`, { reason });
    return response.success;
  } catch {
    return false;
  }
}
