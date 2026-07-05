import type { AppOrder, PaymentRequest } from '../types/api';
import { apiPost, isApiEnabled, isMockFallbackAllowed } from './apiClient';
import { isMiniProgramRuntime, wxRequestPayment } from './miniProgramBridge';

type MockPaymentResponse = {
  order: AppOrder;
};

export async function requestMiniProgramPayment(payment: PaymentRequest): Promise<AppOrder | null> {
  if (!isApiEnabled()) return null;

  if (payment.mode === 'mock' && !isMockFallbackAllowed()) {
    throw new Error('Mock payment is disabled in this environment.');
  }

  if (payment.mode !== 'mock' && isMiniProgramRuntime()) {
    await wxRequestPayment(payment.miniProgramPayParams);
  }

  if (payment.mode !== 'mock' && !isMockFallbackAllowed()) {
    return null;
  }

  const mockSuccessPath = payment.payPayload?.mockSuccessPath || `/api/payments/${payment.paymentId}/mock-success`;
  const response = await apiPost<MockPaymentResponse>(mockSuccessPath);
  return response.success ? response.data.order : null;
}
