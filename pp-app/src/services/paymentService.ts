import type { AppOrder, PaymentRequest } from '../types/api';
import { apiGet, apiPost, isApiEnabled, isMockFallbackAllowed } from './apiClient';
import { isMiniProgramRuntime, wxRequestPayment } from './miniProgramBridge';

type MockPaymentResponse = {
  order: AppOrder;
};

type PaymentStatusResponse = {
  payment: PaymentRequest;
  order: AppOrder;
};

export async function requestMiniProgramPayment(payment: PaymentRequest): Promise<AppOrder | null> {
  if (!isApiEnabled()) return null;

  if (payment.mode === 'mock' && !isMockFallbackAllowed()) {
    throw new Error('Mock payment is disabled in this environment.');
  }

  if (payment.mode !== 'mock' && isMiniProgramRuntime()) {
    await wxRequestPayment(payment.miniProgramPayParams);
    return pollPaymentStatus(payment.paymentId);
  }

  if (payment.mode !== 'mock' && !isMockFallbackAllowed()) {
    return fetchPaymentStatus(payment.paymentId);
  }

  const mockSuccessPath = payment.payPayload?.mockSuccessPath || `/api/payments/${payment.paymentId}/mock-success`;
  const response = await apiPost<MockPaymentResponse>(mockSuccessPath);
  return response.success ? response.data.order : null;
}

export async function fetchPaymentStatus(paymentId: string): Promise<AppOrder | null> {
  if (!isApiEnabled()) return null;
  const response = await apiGet<PaymentStatusResponse>(`/api/payments/${encodeURIComponent(paymentId)}/status`);
  return response.success ? response.data.order : null;
}

async function pollPaymentStatus(paymentId: string, attempts = 3): Promise<AppOrder | null> {
  let lastOrder: AppOrder | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await delay(900);
    lastOrder = await fetchPaymentStatus(paymentId);
    if (lastOrder && lastOrder.status !== 'pending_payment') return lastOrder;
  }
  return lastOrder;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
