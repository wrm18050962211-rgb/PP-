import { seedOrders } from '../data/mockApi';
import type { AppOrder, CreateOrderInput, OrderStatus, PaymentRequest } from '../types/api';
import { formatMoney } from '../utils/money';
import { getOrderSteps, orderStatusText } from '../utils/status';
import { apiGet, apiPost, isApiEnabled, useMockFallback } from './apiClient';
import { requestMiniProgramPayment } from './paymentService';

type CreateOrderResponse = AppOrder & {
  payment?: PaymentRequest;
};

export function listSeedOrders(): AppOrder[] {
  return seedOrders;
}

export function createLocalOrder(input: CreateOrderInput, status: OrderStatus = 'paid_pending_confirm'): AppOrder {
  const steps = getOrderSteps(status);
  return {
    ...input,
    id: `local-${Date.now()}`,
    orderNo: `PP${Date.now().toString().slice(-8)}`,
    status,
    statusText: orderStatusText[status],
    amountText: formatMoney(input.amountCents),
    createdAt: new Date().toISOString(),
    ...steps,
  };
}

export async function fetchOrders(role: 'user' | 'companion' | 'admin' = 'user'): Promise<AppOrder[]> {
  if (!isApiEnabled()) return useMockFallback(listSeedOrders(), 'seed orders');

  try {
    const response = await apiGet<{ items: AppOrder[] }>(`/api/orders?role=${role}`);
    return response.success ? response.data.items : useMockFallback(listSeedOrders(), 'seed orders');
  } catch {
    return useMockFallback(listSeedOrders(), 'seed orders');
  }
}

export async function submitOrder(input: CreateOrderInput): Promise<AppOrder> {
  if (!isApiEnabled()) return useMockFallback(createLocalOrder(input), 'local order creation');

  try {
    const response = await apiPost<CreateOrderResponse>('/api/orders', input);
    if (!response.success) return useMockFallback(createLocalOrder(input), 'local order creation');

    const payment = response.data.payment;
    if (!payment) return response.data;

    const paidOrder = await requestMiniProgramPayment(payment);
    return paidOrder ?? response.data;
  } catch {
    return useMockFallback(createLocalOrder(input), 'local order creation');
  }
}

export async function updateRemoteOrderStatus(orderId: string, status: OrderStatus): Promise<AppOrder | null> {
  if (!isApiEnabled()) return null;

  const actionPath =
    status === 'confirmed'
      ? `/api/orders/${orderId}/confirm`
      : status === 'completed'
        ? `/api/orders/${orderId}/complete`
        : status === 'cancelled'
          ? `/api/orders/${orderId}/cancel`
          : `/api/orders/${orderId}/status`;

  try {
    const response = await apiPost<AppOrder>(
      actionPath,
      status === 'confirmed' || status === 'completed' || status === 'cancelled' ? undefined : { status },
    );
    return response.success ? response.data : null;
  } catch {
    return null;
  }
}
