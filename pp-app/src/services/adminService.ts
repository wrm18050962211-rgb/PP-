import { adminDashboard, mockConversation, seedOrders } from '../data/mockApi';
import type {
  AdminActionType,
  AdminDashboardData,
  AdminModerationData,
  AdminReportCase,
  AdminRiskMessageCase,
  AppOrder,
  CompanionApplication,
  Message,
  PublishedWorkDraft,
} from '../types/api';
import { evaluateMessageRisk } from '../utils/messageRisk';
import { apiGet, apiPost, isApiEnabled, useMockFallback } from './apiClient';

const moderationStorageKey = 'pp-admin-moderation-v1';

export function getAdminDashboardData(application: CompanionApplication, workDraft: PublishedWorkDraft, orders: AppOrder[]): AdminDashboardData {
  return {
    metrics: [
      { label: '待审核陪拍者', value: application.reviewStatus === '待审核' ? '1' : '0' },
      { label: '待审作品', value: workDraft.reviewStatus === '待审核' ? '1' : '0' },
      { label: '订单总数', value: String(orders.length) },
      { label: '风控拦截', value: adminDashboard.metrics.find((metric) => metric.label === '风控拦截')?.value ?? '0' },
    ],
    moduleCards: adminDashboard.moduleCards,
  };
}

export async function fetchAdminDashboardData(application: CompanionApplication, workDraft: PublishedWorkDraft, orders: AppOrder[]): Promise<AdminDashboardData> {
  const fallback = getAdminDashboardData(application, workDraft, orders);
  if (!isApiEnabled()) return useMockFallback(fallback, 'admin dashboard');

  try {
    const response = await apiGet<AdminDashboardData>('/api/admin/dashboard');
    return response.success ? response.data : useMockFallback(fallback, 'admin dashboard');
  } catch {
    return useMockFallback(fallback, 'admin dashboard');
  }
}

export async function approveAuditCase(caseId: string) {
  if (!isApiEnabled()) return true;

  try {
    const response = await apiPost<{ ok: boolean }>(`/api/admin/audit-cases/${caseId}/approve`);
    return response.success;
  } catch {
    return false;
  }
}

export async function rejectAuditCase(caseId: string, reason: string) {
  if (!isApiEnabled()) return true;

  try {
    const response = await apiPost<{ ok: boolean }>(`/api/admin/audit-cases/${caseId}/reject`, { reason });
    return response.success;
  } catch {
    return false;
  }
}

export function getAdminModerationData(orders: AppOrder[] = seedOrders): AdminModerationData {
  if (!isApiEnabled()) {
    const stored = readLocalModerationData();
    if (stored) return mergeModerationOrders(stored, orders);
  }

  return createSeedModerationData(orders);
}

export async function fetchAdminModerationData(orders: AppOrder[] = seedOrders): Promise<AdminModerationData> {
  const fallback = getAdminModerationData(orders);
  if (!isApiEnabled()) return useMockFallback(fallback, 'admin moderation data');

  try {
    const response = await apiGet<AdminModerationData>('/api/admin/moderation');
    return response.success ? response.data : useMockFallback(fallback, 'admin moderation data');
  } catch {
    return useMockFallback(fallback, 'admin moderation data');
  }
}

export function applyAdminModerationAction(
  data: AdminModerationData,
  caseId: string,
  actionType: AdminActionType,
  note = '',
): AdminModerationData {
  const actionLabel = adminActionLabels[actionType];
  const log = {
    id: `action-${Date.now()}`,
    type: actionType,
    label: actionLabel,
    note: note || actionLabel,
    createdAt: new Date().toISOString(),
  };

  const nextData = {
    messageCases: data.messageCases.map((item) => {
      if (item.id !== caseId) return item;
      return {
        ...item,
        status: getNextMessageCaseStatus(actionType, item.status),
        actionLogs: [log, ...item.actionLogs],
      };
    }),
    reportCases: data.reportCases.map((item) => {
      if (item.id !== caseId) return item;
      return {
        ...item,
        status: getNextReportCaseStatus(actionType, item.status),
        actionLogs: [log, ...item.actionLogs],
      };
    }),
  };

  saveLocalModerationData(nextData);
  return nextData;
}

export async function syncAdminModerationAction(caseId: string, actionType: AdminActionType, note = '') {
  if (!isApiEnabled()) return true;

  try {
    const response = await apiPost<AdminRiskMessageCase | AdminReportCase>(`/api/admin/moderation/${caseId}/actions`, { actionType, note });
    return response.success;
  } catch {
    return false;
  }
}

const adminActionLabels: Record<AdminActionType, string> = {
  release_message: '放行消息',
  confirm_violation: '确认为违规',
  warn_user: '警告用户',
  warn_companion: '警告陪拍者',
  restrict_chat: '限制聊天',
  freeze_order: '冻结订单',
  suspend_companion: '暂停陪拍者接单',
  resolve_report: '处理完成',
};

function getNextMessageCaseStatus(actionType: AdminActionType, currentStatus: AdminRiskMessageCase['status']) {
  if (actionType === 'release_message') return 'released';
  if (actionType === 'confirm_violation') return 'violation';
  if (actionType === 'restrict_chat') return 'restricted';
  return currentStatus;
}

function getNextReportCaseStatus(actionType: AdminActionType, currentStatus: AdminReportCase['status']) {
  if (actionType === 'resolve_report') return 'resolved';
  if (actionType === 'confirm_violation' || actionType === 'freeze_order') return 'investigating';
  return currentStatus;
}

function createSeedModerationData(orders: AppOrder[]): AdminModerationData {
  const primaryOrder = orders[0] ?? seedOrders[0];
  const secondaryOrder = orders[1] ?? seedOrders[1] ?? primaryOrder;
  const blockedMessages: Message[] = [
    {
      id: 'blocked-message-1',
      from: 'user',
      text: '可以加我微信私下沟通吗，线下转账便宜一点。',
      sentAt: '2026-05-24T06:10:00.000Z',
      riskStatus: 'blocked',
    },
    {
      id: 'blocked-message-2',
      from: 'companion',
      text: '你发手机号给我，我把收款码和具体位置发你。',
      sentAt: '2026-05-24T06:18:00.000Z',
      riskStatus: 'blocked',
    },
  ];

  return {
    messageCases: blockedMessages.map((message, index) => createMessageRiskCase(message, index === 0 ? primaryOrder : secondaryOrder, index)),
    reportCases: [
      {
        id: 'report-case-1',
        type: 'report_dispute',
        status: 'pending',
        riskLevel: 'high',
        riskLabel: '爽约纠纷',
        reporterRole: 'user',
        reporterName: '用户 A',
        targetName: secondaryOrder.companion,
        reason: '陪拍者迟到且拒绝退款',
        description: '用户反馈陪拍者迟到 40 分钟，现场沟通后仍要求按原价结算，双方对退款比例有争议。',
        orderId: secondaryOrder.id,
        orderNo: secondaryOrder.orderNo,
        orderTitle: secondaryOrder.title,
        orderStatusText: secondaryOrder.statusText,
        orderAmountText: secondaryOrder.amountText,
        createdAt: '2026-05-24T07:20:00.000Z',
        actionLogs: [],
      },
      {
        id: 'report-case-2',
        type: 'report_dispute',
        status: 'investigating',
        riskLevel: 'medium',
        riskLabel: '服务质量',
        reporterRole: 'companion',
        reporterName: primaryOrder.companion,
        targetName: '用户 B',
        reason: '用户临时变更路线',
        description: '陪拍者反馈用户现场新增多个拍摄点，超出原订单范围，双方对加时费用未达成一致。',
        orderId: primaryOrder.id,
        orderNo: primaryOrder.orderNo,
        orderTitle: primaryOrder.title,
        orderStatusText: primaryOrder.statusText,
        orderAmountText: primaryOrder.amountText,
        createdAt: '2026-05-24T08:05:00.000Z',
        actionLogs: [],
      },
    ],
  };
}

function createMessageRiskCase(message: Message, order: AppOrder, index: number): AdminRiskMessageCase {
  const risk = evaluateMessageRisk(message.text);
  const riskLevel = risk.level === 'clean' ? 'low' : risk.level;
  return {
    id: `message-risk-case-${index + 1}`,
    type: 'message_risk',
    status: 'pending',
    riskLevel,
    riskLabel: riskLevel === 'high' ? '高风险拦截' : '中风险标记',
    conversationId: `local-conversation-${order.id}`,
    orderId: order.id,
    orderNo: order.orderNo,
    orderTitle: order.title,
    orderStatusText: order.statusText,
    orderAmountText: order.amountText,
    userName: `用户 ${index + 1}`,
    companionName: order.companion,
    blockedMessage: message,
    hitWords: risk.hits.map((hit) => ({ keyword: hit.keyword, label: hit.label, level: hit.level })),
    contextMessages: [
      ...mockConversation.messages,
      message,
      {
        id: `system-after-block-${index + 1}`,
        from: 'system',
        text: '系统已拦截该消息，等待运营复核。',
        sentAt: message.sentAt,
        riskStatus: 'clean',
      },
    ],
    createdAt: message.sentAt,
    actionLogs: [],
  };
}

function mergeModerationOrders(data: AdminModerationData, orders: AppOrder[]) {
  const orderById = new Map(orders.map((order) => [order.id, order]));
  return {
    messageCases: data.messageCases.map((item) => {
      const order = orderById.get(item.orderId);
      if (!order) return item;
      return {
        ...item,
        orderTitle: order.title,
        orderStatusText: order.statusText,
        orderAmountText: order.amountText,
        companionName: order.companion,
      };
    }),
    reportCases: data.reportCases.map((item) => {
      const order = orderById.get(item.orderId);
      if (!order) return item;
      return {
        ...item,
        orderTitle: order.title,
        orderStatusText: order.statusText,
        orderAmountText: order.amountText,
      };
    }),
  };
}

function saveLocalModerationData(data: AdminModerationData) {
  if (isApiEnabled() || typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(moderationStorageKey, JSON.stringify(data));
  } catch {
    // Local persistence is best-effort in MVP mode.
  }
}

function readLocalModerationData() {
  if (typeof localStorage === 'undefined') return null;

  try {
    const raw = localStorage.getItem(moderationStorageKey);
    return raw ? (JSON.parse(raw) as AdminModerationData) : null;
  } catch {
    return null;
  }
}
