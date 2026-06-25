import type { AppOrder, PaymentRequest } from '../types/api';
import { apiPost, isApiEnabled, isMockRuntimeAllowed, isProductionRuntime } from './apiClient';
import { isMiniProgramRuntime, wxRequestPayment } from './miniProgramBridge';

type MockPaymentResponse = {
  order: AppOrder;
};

export async function requestMiniProgramPayment(payment: PaymentRequest): Promise<AppOrder | null> {
  if (!isApiEnabled()) return null;
  if (isProductionRuntime() && (payment.mode === 'mock' || payment.provider === 'mock_wechat' || payment.payPayload?.mockSuccessPath)) {
    throw new Error('生产环境不能使用 mock 支付，请接入真实支付回调和查询接口。');
  }

  if (payment.mode !== 'mock' && isMiniProgramRuntime()) {
    await wxRequestPayment(payment.miniProgramPayParams);
  }

  if (!isMockRuntimeAllowed()) return null;

  const mockSuccessPath = payment.payPayload?.mockSuccessPath || `/api/payments/${payment.paymentId}/mock-success`;
  const response = await apiPost<MockPaymentResponse>(mockSuccessPath);
  return response.success ? response.data.order : null;
}
