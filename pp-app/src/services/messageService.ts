import { mockConversation, seedOrders } from '../data/mockApi';
import type { AppOrder, Conversation, Message } from '../types/api';
import { blockedWords, evaluateMessageRisk, findMessageRiskWords } from '../utils/messageRisk';
import { apiGet, apiPost, getApiFallback, isApiEnabled, isMockFallbackAllowed } from './apiClient';
import { findLedgerOrder } from './virtualOrderLedger';

const localConversationStorageKey = 'order-conversations-v1';
const sharedConversationStorageKey = `pp-cloud-db:shared:${localConversationStorageKey}`;
const defaultConversationPageSize = 20;
const maxConversationPageSize = 50;

export type ConversationPageRequest = {
  limit?: number;
  cursor?: string | null;
};

export type ConversationPage = {
  items: Conversation[];
  nextCursor: string | null;
  hasMore: boolean;
};

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
  if (!orderId) return getApiFallback(getLocalConversation(orderId), 'Conversation');
  if (!isApiEnabled()) return getApiFallback(getLocalConversation(orderId), 'Conversation');

  try {
    const response = await apiGet<Conversation>(`/api/orders/${orderId}/conversation`);
    return response.success ? response.data : getApiFallback(getLocalConversation(orderId), 'Conversation');
  } catch {
    return getApiFallback(getLocalConversation(orderId), 'Conversation');
  }
}

export async function fetchConversationPage(options: ConversationPageRequest = {}): Promise<ConversationPage> {
  if (!isApiEnabled()) return getApiFallback(listLocalConversationPage(options), 'Conversation list');

  try {
    const response = await apiGet<ConversationPage>(buildConversationsPath(options));
    return response.success
      ? {
          items: response.data.items,
          nextCursor: response.data.nextCursor ?? null,
          hasMore: Boolean(response.data.hasMore),
        }
      : getApiFallback(listLocalConversationPage(options), 'Conversation list');
  } catch {
    return getApiFallback(listLocalConversationPage(options), 'Conversation list');
  }
}

export async function fetchConversations(options: ConversationPageRequest = {}): Promise<Conversation[]> {
  const page = await fetchConversationPage({ limit: maxConversationPageSize, ...options });
  return page.items;
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
    return getApiFallback({
      blocked: false,
      matchedKeywords: [],
      message: createLocalMessage(content, risk.level === 'medium' ? 'flagged' : 'clean', from),
    }, 'Send message');
  }

  try {
    const response = await apiPost<Message>(`/api/conversations/${conversationId}/messages`, { content, from });
    return response.success ? { blocked: false, matchedKeywords: [], message: response.data } : { blocked: true, matchedKeywords };
  } catch {
    return getApiFallback(
      { blocked: false, matchedKeywords: [], message: createLocalMessage(content, risk.level === 'medium' ? 'flagged' : 'clean', from) },
      'Send message',
    );
  }
}

export async function sendImageMessage(
  conversationId: string,
  file: File,
  from: Message['from'] = 'user',
): Promise<{ blocked: boolean; message?: Message; matchedKeywords: string[] }> {
  const scanText = `图片 ${file.name}`;
  const risk = evaluateMessageRisk(scanText);
  const matchedKeywords = risk.hits.map((hit) => hit.keyword);
  if (risk.shouldBlock) {
    if (isApiEnabled()) {
      try {
        await apiPost<Message>(`/api/conversations/${conversationId}/messages`, { content: scanText, from, kind: 'image' });
      } catch {
        // The local UI still blocks the image even if risk-case sync fails.
      }
    }
    return { blocked: true, matchedKeywords };
  }

  if (!isMockFallbackAllowed()) {
    throw new Error('图片消息需要先接入生产媒体上传接口。');
  }

  const imageUrl = await readFileAsDataUrl(file);
  return getApiFallback({
    blocked: false,
    matchedKeywords,
    message: createLocalMessage('[图片]', risk.level === 'medium' ? 'flagged' : 'clean', from, {
      kind: 'image',
      imageName: file.name,
      imageUrl,
    }),
  }, 'Send image message');
}

export function sendVoiceMessage(
  durationSeconds = 8,
  from: Message['from'] = 'user',
): { blocked: boolean; message: Message; matchedKeywords: string[] } {
  return getApiFallback({
    blocked: false,
    matchedKeywords: [],
    message: createLocalMessage(`[语音] ${durationSeconds}秒`, 'clean', from, {
      kind: 'voice',
      voiceDurationSeconds: durationSeconds,
    }),
  }, 'Send voice message');
}

export async function submitOrderReport(orderId: string, description = '用户在消息页发起举报') {
  if (!isApiEnabled()) return getApiFallback(true, 'Order report');

  try {
    const response = await apiPost<{ ok: boolean }>(`/api/orders/${orderId}/report`, {
      reason: '消息沟通举报',
      description,
      reporterRole: 'user',
    });
    return response.success;
  } catch {
    return getApiFallback(false, 'Order report');
  }
}

export function saveLocalConversation(conversation: Conversation) {
  if (!isMockFallbackAllowed()) return;

  try {
    const conversations = readLocalConversationMessages();
    conversations[conversation.orderId] = conversation.messages;
    writeSharedConversationMessages(conversations);
  } catch {
    // Local persistence is best-effort in MVP mode.
  }
}

function createLocalMessage(
  content: string,
  riskStatus: Message['riskStatus'],
  from: Message['from'] = 'user',
  extra: Partial<Message> = {},
): Message {
  return {
    id: `local-message-${Date.now()}`,
    from,
    kind: extra.kind ?? 'text',
    text: content,
    sentAt: new Date().toISOString(),
    riskStatus,
    ...extra,
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function getLocalConversation(orderId?: string): Conversation {
  const order = findLedgerOrder(orderId) ?? seedOrders.find((item) => item.id === orderId);
  if (!order) return getGenericLocalConversation(orderId);
  const savedMessages = readLocalConversationMessages()[order.id];

  return {
    ...createSeedConversation(order),
    id: `local-conversation-${order.id}`,
    orderId: order.id,
    orderNo: order.orderNo,
    messages: savedMessages?.length ? savedMessages : createSeedConversation(order).messages,
  };
}

function listLocalConversationPage(options: ConversationPageRequest = {}): ConversationPage {
  const request = normalizeConversationPageRequest(options);
  const start = parseConversationCursor(request.cursor);
  const items = seedOrders
    .map((order) => getLocalConversation(order.id))
    .slice(start, start + request.limit);
  const nextOffset = start + items.length;

  return {
    items,
    nextCursor: nextOffset < seedOrders.length ? String(nextOffset) : null,
    hasMore: nextOffset < seedOrders.length,
  };
}

function normalizeConversationPageRequest(options: ConversationPageRequest) {
  return {
    limit: clampConversationLimit(options.limit),
    cursor: options.cursor ?? null,
  };
}

function clampConversationLimit(limit?: number) {
  if (!Number.isFinite(limit)) return defaultConversationPageSize;
  return Math.max(1, Math.min(Math.floor(limit as number), maxConversationPageSize));
}

function parseConversationCursor(cursor?: string | null) {
  const offset = Number.parseInt(cursor || '0', 10);
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
}

function buildConversationsPath(options: ConversationPageRequest) {
  const request = normalizeConversationPageRequest(options);
  const params = new URLSearchParams();
  params.set('limit', String(request.limit));
  if (request.cursor) params.set('cursor', request.cursor);
  return `/api/conversations?${params.toString()}`;
}

function getGenericLocalConversation(orderId?: string): Conversation {
  const id = orderId || 'local-generic-thread';
  const savedMessages = readLocalConversationMessages()[id];
  return {
    ...mockConversation,
    id: `local-conversation-${id}`,
    orderId: id,
    orderNo: id.startsWith('consultation-') ? '咨询会话' : '本地会话',
    messages: savedMessages?.length
      ? savedMessages
      : [{
        id: `${id}-message-1`,
        from: 'user',
        text: id.startsWith('consultation-') ? '我已提交需求卡，想先咨询档期和报价。' : '会话已创建。',
        sentAt: new Date().toISOString(),
        riskStatus: 'clean',
      }],
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
  if (!isMockFallbackAllowed()) return {};
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(sharedConversationStorageKey);
    return raw ? (JSON.parse(raw) as Record<string, Message[]>) : {};
  } catch {
    return {};
  }
}

function writeSharedConversationMessages(messages: Record<string, Message[]>) {
  if (!isMockFallbackAllowed()) return;
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(sharedConversationStorageKey, JSON.stringify(messages));
}
