import { seedOrders } from '../data/mockApi';
import type { AppOrder, CreateOrderInput, OrderStatus, PaymentRequest } from '../types/api';
import { formatMoney } from '../utils/money';
import { getOrderSteps, orderStatusText } from '../utils/status';
import { apiGet, apiPost, isApiEnabled } from './apiClient';
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
  if (!isApiEnabled()) return listSeedOrders();

  try {
    const response = await apiGet<{ items: AppOrder[] }>(`/api/orders?role=${role}`);
    return response.success ? response.data.items : listSeedOrders();
  } catch {
    return listSeedOrders();
  }
}

export async function submitOrder(input: CreateOrderInput): Promise<AppOrder> {
  if (!isApiEnabled()) return createLocalOrder(input);

  try {
    const response = await apiPost<CreateOrderResponse>('/api/orders', input);
    if (!response.success) return createLocalOrder(input);

    const payment = response.data.payment;
    if (!payment) return response.data;

    const paidOrder = await requestMiniProgramPayment(payment);
    return paidOrder ?? response.data;
  } catch {
    return createLocalOrder(input);
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
