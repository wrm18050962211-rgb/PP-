import { defaultApplication, defaultWorkDraft, seedOrders } from '../data/mockApi';
import type { CompanionApplication, CompanionDashboard, PublishedWorkDraft } from '../types/api';
import { apiGet, apiPost, isApiEnabled, useMockFallback } from './apiClient';

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
  if (!isApiEnabled()) return useMockFallback(getCompanionDashboard(), 'companion dashboard');

  try {
    const response = await apiGet<CompanionDashboard>('/api/companion/me');
    return response.success ? response.data : useMockFallback(getCompanionDashboard(), 'companion dashboard');
  } catch {
    return useMockFallback(getCompanionDashboard(), 'companion dashboard');
  }
}

export async function saveCompanionApplicationDraft(application: CompanionApplication): Promise<CompanionApplication> {
  if (!isApiEnabled()) return application;

  try {
    const response = await apiPost<CompanionApplication>('/api/companion/me/application', application);
    return response.success ? response.data : application;
  } catch {
    return application;
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
