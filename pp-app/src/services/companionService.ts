import { defaultApplication, defaultWorkDraft, seedOrders } from '../data/mockApi';
import type { CompanionApplication, CompanionDashboard, PublishedWorkDraft } from '../types/api';
import { apiGet, apiPost, getApiFallback, isApiEnabled } from './apiClient';

export function getDefaultApplication(): CompanionApplication {
  return defaultApplication;
}

export function getDefaultWorkDraft(): PublishedWorkDraft {
  return defaultWorkDraft;
}

export function getCompanionDashboard(): CompanionDashboard {
  return {
    weeklyEstimatedCents: 129600,
    pendingCents: 79900,
    availableCents: 49700,
    orderStats: ['待确认 3', '今日行程 1', `已完成 ${18 + seedOrders.length}`, '取消 0'],
  };
}

export async function fetchCompanionDashboard(): Promise<CompanionDashboard> {
  if (!isApiEnabled()) return getApiFallback(getCompanionDashboard(), 'Companion dashboard');

  try {
    const response = await apiGet<CompanionDashboard>('/api/companion/me');
    return response.success ? response.data : getApiFallback(getCompanionDashboard(), 'Companion dashboard');
  } catch {
    return getApiFallback(getCompanionDashboard(), 'Companion dashboard');
  }
}

export async function saveCompanionApplicationDraft(application: CompanionApplication): Promise<CompanionApplication> {
  if (!isApiEnabled()) return getApiFallback(application, 'Save companion application draft');

  try {
    const response = await apiPost<CompanionApplication>('/api/companion/me/application', application);
    return response.success ? response.data : getApiFallback(application, 'Save companion application draft');
  } catch {
    return getApiFallback(application, 'Save companion application draft');
  }
}

export async function submitCompanionApplicationReview(application: CompanionApplication): Promise<CompanionApplication> {
  if (!isApiEnabled()) return { ...application, submitted: true, reviewStatus: '待审核', updatedAt: new Date().toISOString() };

  try {
    const response = await apiPost<CompanionApplication>('/api/companion/me/submit-review');
    return response.success ? response.data : { ...application, submitted: true, reviewStatus: '待审核', updatedAt: new Date().toISOString() };
  } catch {
    return { ...application, submitted: true, reviewStatus: '待审核', updatedAt: new Date().toISOString() };
  }
}
