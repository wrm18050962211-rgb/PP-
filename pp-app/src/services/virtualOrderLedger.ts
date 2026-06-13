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

export function createLedgerOrder(input: CreateOrderInput, session: AuthSession | null): AppOrder {
  const order = createLocalOrder(input, 'paid_pending_confirm');
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

export function upsertLedgerOrder(order: AppOrder) {
  const orders = readLedgerOrders();
  writeLedgerOrders([order, ...orders.filter((item) => item.id !== order.id)]);
}

function readLedgerOrders(): AppOrder[] {
  if (typeof localStorage === 'undefined') return seedLedgerOrders();
  try {
    const raw = localStorage.getItem(ledgerStorageKey);
    if (raw) return JSON.parse(raw) as AppOrder[];
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

  return seedOrders.map((order, index) => {
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
