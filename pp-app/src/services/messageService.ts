import { mockConversation, seedOrders } from '../data/mockApi';
import type { Conversation, Message } from '../types/api';
import { blockedWords, evaluateMessageRisk, findMessageRiskWords } from '../utils/messageRisk';
import { apiGet, apiPost, isApiEnabled } from './apiClient';

const localConversationStorageKey = 'pp-order-conversations-v1';

export function getConversation(): Conversation {
  return mockConversation;
}

export function listBlockedWords() {
  return blockedWords;
}

export { evaluateMessageRisk, findMessageRiskWords };

export async function fetchConversation(orderId?: string): Promise<Conversation> {
  if (!isApiEnabled() || !orderId) return getLocalConversation(orderId);

  try {
    const response = await apiGet<Conversation>(`/api/orders/${orderId}/conversation`);
    return response.success ? response.data : getLocalConversation(orderId);
  } catch {
    return getLocalConversation(orderId);
  }
}

export async function sendMessage(conversationId: string, content: string): Promise<{ blocked: boolean; message?: Message; matchedKeywords: string[] }> {
  const risk = evaluateMessageRisk(content);
  const matchedKeywords = risk.hits.map((hit) => hit.keyword);
  if (risk.shouldBlock) {
    if (isApiEnabled()) {
      try {
        await apiPost<Message>(`/api/conversations/${conversationId}/messages`, { content });
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
      message: createLocalMessage(content, risk.level === 'medium' ? 'flagged' : 'clean'),
    };
  }

  try {
    const response = await apiPost<Message>(`/api/conversations/${conversationId}/messages`, { content });
    return response.success ? { blocked: false, matchedKeywords: [], message: response.data } : { blocked: true, matchedKeywords };
  } catch {
    return { blocked: false, matchedKeywords: [], message: createLocalMessage(content, risk.level === 'medium' ? 'flagged' : 'clean') };
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
  if (typeof localStorage === 'undefined') return;

  try {
    const conversations = readLocalConversationMessages();
    conversations[conversation.orderId] = conversation.messages;
    localStorage.setItem(localConversationStorageKey, JSON.stringify(conversations));
  } catch {
    // Local persistence is best-effort in MVP mode.
  }
}

function createLocalMessage(content: string, riskStatus: Message['riskStatus']): Message {
  return {
    id: `local-message-${Date.now()}`,
    from: 'user',
    text: content,
    sentAt: new Date().toISOString(),
    riskStatus,
  };
}

function getLocalConversation(orderId?: string): Conversation {
  const order = seedOrders.find((item) => item.id === orderId) ?? seedOrders[0];
  const savedMessages = readLocalConversationMessages()[order.id];

  return {
    ...mockConversation,
    id: `local-conversation-${order.id}`,
    orderId: order.id,
    orderNo: order.orderNo,
    messages: savedMessages?.length ? savedMessages : mockConversation.messages,
  };
}

function readLocalConversationMessages(): Record<string, Message[]> {
  if (typeof localStorage === 'undefined') return {};

  try {
    const raw = localStorage.getItem(localConversationStorageKey);
    return raw ? (JSON.parse(raw) as Record<string, Message[]>) : {};
  } catch {
    return {};
  }
}
