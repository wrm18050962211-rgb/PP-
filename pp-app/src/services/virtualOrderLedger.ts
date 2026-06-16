import type { AppOrder, AuthSession, CreateOrderInput, OrderStatus } from '../types/api';
import { getOrderSteps, orderStatusText } from '../utils/status';
import { listTestAccounts } from './accountDirectory';
import { listFeedPosts } from './feedService';
import { createLocalOrder, listSeedOrders } from './orderService';

const ledgerStorageKey = 'pp-cloud-db:shared:orders-ledger-v1';

type OrderActor = {
  creatorId?: string;
  creatorPhone?: string;
  creatorName?: string;
  companionPhone?: string;
};

export function createLedgerOrder(input: CreateOrderInput, session: AuthSession | null, initialStatus: OrderStatus = 'paid_pending_confirm'): AppOrder {
  const order = createLocalOrder(input, initialStatus);
  const actor = getOrderActor(input.companionId, session);
  const nextOrder = { ...order, ...actor };
  upsertLedgerOrder(nextOrder);
  return nextOrder;
}

export function listLedgerOrdersForSession(session: AuthSession | null): AppOrder[] {
  const orders = readLedgerOrders();
  if (!session) return [];
  if (session.role === 'admin') return orders;
  if (session.role === 'companion') {
    return orders.filter((order) => order.companionId === session.companionId);
  }
  return orders.filter((order) => order.creatorId === session.user.id || order.creatorPhone === session.user.phone);
}

export function findLedgerOrder(orderId?: string) {
  if (!orderId) return null;
  return readLedgerOrders().find((order) => order.id === orderId) ?? null;
}

export function updateLedgerOrderStatus(orderId: string, status: OrderStatus) {
  const steps = getOrderSteps(status);
  const nextOrders = readLedgerOrders().map((order) =>
    order.id === orderId
      ? {
          ...order,
          status,
          statusText: orderStatusText[status],
          ...steps,
        }
      : order,
  );
  writeLedgerOrders(nextOrders);
  return nextOrders.find((order) => order.id === orderId) ?? null;
}

export function updateLedgerOrderFunding(orderId: string, patch: Partial<AppOrder>) {
  const nextOrders = readLedgerOrders().map((order) => (order.id === orderId ? { ...order, ...patch } : order));
  writeLedgerOrders(nextOrders);
  return nextOrders.find((order) => order.id === orderId) ?? null;
}

export function upsertLedgerOrder(order: AppOrder) {
  const orders = readLedgerOrders();
  writeLedgerOrders([order, ...orders.filter((item) => item.id !== order.id)]);
}

function readLedgerOrders(): AppOrder[] {
  if (typeof localStorage === 'undefined') return seedLedgerOrders();
  try {
    const raw = localStorage.getItem(ledgerStorageKey);
    if (raw) {
      const orders = mergeVirtualTransactionOrders(JSON.parse(raw) as AppOrder[]);
      writeLedgerOrders(orders);
      return orders;
    }
    const seeded = seedLedgerOrders();
    writeLedgerOrders(seeded);
    return seeded;
  } catch {
    return seedLedgerOrders();
  }
}

function writeLedgerOrders(orders: AppOrder[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ledgerStorageKey, JSON.stringify(orders));
}

function seedLedgerOrders(): AppOrder[] {
  const accounts = listTestAccounts();
  const creatorAccounts = accounts.filter((account) => account.role === 'consumer');
  const photographerAccounts = accounts.filter((account) => account.role === 'companion');
  const posts = listFeedPosts();
  const seedOrders = listSeedOrders();

  const mappedSeedOrders = seedOrders.map((order, index) => {
    const creator = creatorAccounts[index % creatorAccounts.length];
    const photographer =
      photographerAccounts.find((account) => account.companionId === order.companionId) ??
      photographerAccounts[index % photographerAccounts.length];
    const post = posts.find((item) => item.companion.id === photographer?.companionId) ?? posts[index % posts.length];
    return {
      ...order,
      postId: post.id,
      companion: post.companion.name,
      companionId: post.companion.id,
      creatorId: creator?.creatorId,
      creatorPhone: creator?.phone,
      creatorName: creator?.name,
      companionPhone: photographer?.phone,
    };
  });

  return mergeVirtualTransactionOrders(mappedSeedOrders);
}

function mergeVirtualTransactionOrders(orders: AppOrder[]) {
  const posts = listFeedPosts().filter((post) => post.id.startsWith('virtual-trade-post-'));
  const accounts = listTestAccounts();
  const nextOrders = posts.map((post, index): AppOrder => {
    const creator = accounts.find((account) => account.role === 'consumer' && (account.creatorId === post.creator?.id || account.phone === post.creator?.phone));
    const photographer = accounts.find((account) => account.role === 'companion' && account.companionId === post.companion.id);
    const amountCents = [48900, 32900, 52900, 39900][index] ?? 39900;
    const dateLabels = ['今天', '昨天', '6月11日', '6月10日'];
    const timeLabels = ['17:30', '15:30', '19:30', '10:00'];
    const steps = getOrderSteps('completed');

    return {
      id: `virtual-trade-order-${index + 1}`,
      orderNo: `PPV2606${String(index + 1).padStart(4, '0')}`,
      status: 'completed',
      statusText: orderStatusText.completed,
      title: post.activity,
      time: `${dateLabels[index] ?? '今天'} ${timeLabels[index] ?? '12:00'}`,
      place: post.locationName || post.location,
      amountCents,
      amountText: `¥${Math.round(amountCents / 100)}`,
      companion: post.companion.name,
      companionId: post.companion.id,
      creatorId: post.creator?.id || creator?.creatorId,
      creatorPhone: post.creator?.phone || creator?.phone,
      creatorName: post.creator?.name || creator?.name,
      companionPhone: photographer?.phone,
      postId: post.id,
      activityId: post.companion.activities[0]?.id || `virtual-trade-activity-${index + 1}`,
      activityName: post.activity,
      slotId: post.companion.slots[0]?.id || `virtual-trade-slot-${index + 1}`,
      startAt: new Date(Date.UTC(2026, 5, 10 + index, 8 + index, 0, 0)).toISOString(),
      endAt: new Date(Date.UTC(2026, 5, 10 + index, 10 + index, 0, 0)).toISOString(),
      dateLabel: dateLabels[index] ?? '今天',
      timeLabel: timeLabels[index] ?? '12:00',
      durationMinutes: 120,
      durationLabel: '2小时',
      addOns: [],
      createdAt: new Date(Date.UTC(2026, 5, 10 + index, 6, 0, 0)).toISOString(),
      ...steps,
    };
  });

  return [...nextOrders, ...orders.filter((order) => !order.id.startsWith('virtual-trade-order-'))];
}

function getOrderActor(companionId: string, session: AuthSession | null): OrderActor {
  const companionAccount = listTestAccounts().find((account) => account.role === 'companion' && account.companionId === companionId);
  return {
    creatorId: session?.user.id,
    creatorPhone: session?.user.phone,
    creatorName: session?.user.nickname,
    companionPhone: companionAccount?.phone,
  };
}
