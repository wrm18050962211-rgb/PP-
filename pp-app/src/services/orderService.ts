import { seedOrders } from '../data/mockApi';
import type { AppOrder, CreateOrderInput, OrderStatus } from '../types/api';
import { formatMoney } from '../utils/money';
import { getOrderSteps, orderStatusText } from '../utils/status';
import { apiGet, apiPost, isApiEnabled } from './apiClient';

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

export async function fetchOrders(role: 'user' | 'companion' = 'user'): Promise<AppOrder[]> {
  if (!isApiEnabled()) return listSeedOrders();

  try {
    const response = await apiGet<{ items: AppOrder[] }>(`/api/orders?role=${role}`);
    return response.success ? response.data.items : listSeedOrders();
  } catch {
    return listSeedOrders();
  }
}

export async function submitOrder(input: CreateOrderInput): Promise<AppOrder> {
  const response = await apiPost<AppOrder>('/api/orders', input);
  return response.success ? response.data : createLocalOrder(input);
}
