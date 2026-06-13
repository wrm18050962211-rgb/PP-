import { mockConversation, seedOrders } from '../data/mockApi';
import type { AppOrder, Conversation, Message } from '../types/api';
import { blockedWords, evaluateMessageRisk, findMessageRiskWords } from '../utils/messageRisk';
import { apiGet, apiPost, isApiEnabled } from './apiClient';
import { findLedgerOrder } from './virtualOrderLedger';

const localConversationStorageKey = 'order-conversations-v1';
const sharedConversationStorageKey = `pp-cloud-db:shared:${localConversationStorageKey}`;

export function getConversation(): Conversation {
  return mockConversation;
}

export function listBlockedWords() {
  return blockedWords;
}

export { evaluateMessageRisk, findMessageRiskWords };

export function getConversationForOrder(orderId?: string): Conversation {
  return getLocalConversation(orderId);
}

export async function fetchConversation(orderId?: string): Promise<Conversation> {
  if (!isApiEnabled() || !orderId) return getLocalConversation(orderId);

  try {
    const response = await apiGet<Conversation>(`/api/orders/${orderId}/conversation`);
    return response.success ? response.data : getLocalConversation(orderId);
  } catch {
    return getLocalConversation(orderId);
  }
}

export async function sendMessage(
  conversationId: string,
  content: string,
  from: Message['from'] = 'user',
): Promise<{ blocked: boolean; message?: Message; matchedKeywords: string[] }> {
  const risk = evaluateMessageRisk(content);
  const matchedKeywords = risk.hits.map((hit) => hit.keyword);
  if (risk.shouldBlock) {
    if (isApiEnabled()) {
      try {
        await apiPost<Message>(`/api/conversations/${conversationId}/messages`, { content, from });
      } catch {
        // The local UI still blocks the message even if risk-case sync fails.
      }
    }
    return { blocked: true, matchedKeywords };
  }

  if (!isApiEnabled()) {
    return {
      blocked: false,
      matchedKeywords: [],
      message: createLocalMessage(content, risk.level === 'medium' ? 'flagged' : 'clean', from),
    };
  }

  try {
    const response = await apiPost<Message>(`/api/conversations/${conversationId}/messages`, { content, from });
    return response.success ? { blocked: false, matchedKeywords: [], message: response.data } : { blocked: true, matchedKeywords };
  } catch {
    return { blocked: false, matchedKeywords: [], message: createLocalMessage(content, risk.level === 'medium' ? 'flagged' : 'clean', from) };
  }
}

export async function submitOrderReport(orderId: string, description = '用户在消息页发起举报') {
  if (!isApiEnabled()) return true;

  try {
    const response = await apiPost<{ ok: boolean }>(`/api/orders/${orderId}/report`, {
      reason: '消息沟通举报',
      description,
      reporterRole: 'user',
    });
    return response.success;
  } catch {
    return false;
  }
}

export function saveLocalConversation(conversation: Conversation) {
  try {
    const conversations = readLocalConversationMessages();
    conversations[conversation.orderId] = conversation.messages;
    writeSharedConversationMessages(conversations);
  } catch {
    // Local persistence is best-effort in MVP mode.
  }
}

function createLocalMessage(content: string, riskStatus: Message['riskStatus'], from: Message['from'] = 'user'): Message {
  return {
    id: `local-message-${Date.now()}`,
    from,
    text: content,
    sentAt: new Date().toISOString(),
    riskStatus,
  };
}

function getLocalConversation(orderId?: string): Conversation {
  const order = findLedgerOrder(orderId) ?? seedOrders.find((item) => item.id === orderId) ?? seedOrders[0];
  const savedMessages = readLocalConversationMessages()[order.id];

  return {
    ...createSeedConversation(order),
    id: `local-conversation-${order.id}`,
    orderId: order.id,
    orderNo: order.orderNo,
    messages: savedMessages?.length ? savedMessages : createSeedConversation(order).messages,
  };
}

function createSeedConversation(order: AppOrder): Conversation {
  const createdAt = new Date(order.createdAt || Date.now()).getTime();
  return {
    ...mockConversation,
    id: `local-conversation-${order.id}`,
    orderId: order.id,
    orderNo: order.orderNo,
    messages: [
      {
        id: `${order.id}-message-1`,
        from: 'user',
        text: `你好，我想约 ${order.activityName ?? order.title}，时间是 ${order.dateLabel ?? order.time} ${order.timeLabel ?? ''}，地点在 ${order.place}。`,
        sentAt: new Date(createdAt + 60 * 1000).toISOString(),
        riskStatus: 'clean',
      },
      {
        id: `${order.id}-message-2`,
        from: 'companion',
        text: `可以，我看了你的需求，会按 ${order.place} 附近的光线和人流提前规划路线。`,
        sentAt: new Date(createdAt + 6 * 60 * 1000).toISOString(),
        riskStatus: 'clean',
      },
      {
        id: `${order.id}-message-3`,
        from: order.status === 'paid_pending_confirm' ? 'user' : 'companion',
        text:
          order.status === 'paid_pending_confirm'
            ? '我这边已付款，等你确认订单后我们再细化拍摄风格。'
            : order.status === 'completed'
              ? '这单已经完成，我们可以在订单里共同编辑成片。'
              : '订单信息我这边已经确认，有变化我们就在这里同步。',
        sentAt: new Date(createdAt + 12 * 60 * 1000).toISOString(),
        riskStatus: 'clean',
      },
    ],
  };
}

function readLocalConversationMessages(): Record<string, Message[]> {
  return readSharedConversationMessages();
}

function readSharedConversationMessages(): Record<string, Message[]> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(sharedConversationStorageKey);
    return raw ? (JSON.parse(raw) as Record<string, Message[]>) : {};
  } catch {
    return {};
  }
}

function writeSharedConversationMessages(messages: Record<string, Message[]>) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(sharedConversationStorageKey, JSON.stringify(messages));
}
