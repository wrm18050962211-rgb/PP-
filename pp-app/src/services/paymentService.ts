import type { AppOrder, PaymentRequest } from '../types/api';
import { apiPost, isApiEnabled } from './apiClient';
import { isMiniProgramRuntime, wxRequestPayment } from './miniProgramBridge';

type MockPaymentResponse = {
  order: AppOrder;
};

export async function requestMiniProgramPayment(payment: PaymentRequest): Promise<AppOrder | null> {
  if (!isApiEnabled()) return null;

  if (payment.mode !== 'mock' && isMiniProgramRuntime()) {
    await wxRequestPayment(payment.miniProgramPayParams);
  }

  const mockSuccessPath = payment.payPayload?.mockSuccessPath || `/api/payments/${payment.paymentId}/mock-success`;
  const response = await apiPost<MockPaymentResponse>(mockSuccessPath);
  return response.success ? response.data.order : null;
}
