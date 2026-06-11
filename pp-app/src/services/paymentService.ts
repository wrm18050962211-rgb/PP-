import type { AppOrder, PaymentRequest } from '../types/api';
import { apiPost, isApiEnabled } from './apiClient';

type MiniProgramWxBridge = {
  requestPayment?: (options: PaymentRequest['miniProgramPayParams'] & { success?: () => void; fail?: (error: unknown) => void }) => void;
};

type MockPaymentResponse = {
  order: AppOrder;
};

export async function requestMiniProgramPayment(payment: PaymentRequest): Promise<AppOrder | null> {
  if (!isApiEnabled()) return null;

  const wxBridge = getWxBridge();
  if (wxBridge?.requestPayment && payment.mode !== 'mock') {
    await new Promise<void>((resolve, reject) => {
      wxBridge.requestPayment?.({
        ...payment.miniProgramPayParams,
        success: () => resolve(),
        fail: (error) => reject(error),
      });
    });
  }

  const mockSuccessPath = payment.payPayload?.mockSuccessPath || `/api/payments/${payment.paymentId}/mock-success`;
  const response = await apiPost<MockPaymentResponse>(mockSuccessPath);
  return response.success ? response.data.order : null;
}

function getWxBridge(): MiniProgramWxBridge | null {
  const maybeWx = (globalThis as { wx?: MiniProgramWxBridge }).wx;
  return maybeWx?.requestPayment ? maybeWx : null;
}
