import type {
  BookingRequestStatus,
  ContentReportCategory,
  ContentReportStatus,
  ContentReportTargetType,
  UserRequestStatus,
  UserRequestSupportCategory,
  UserRequestType,
} from '../types/api';

export const bookingStatusLabels: Record<BookingRequestStatus, string> = {
  submitted: '待确认',
  confirmed: '已确认',
  declined: '无法承接',
  cancelled: '已取消',
};

export const userRequestTypeLabels: Record<UserRequestType, string> = {
  support: '客服请求',
  data_access: '数据查阅',
  data_copy: '数据副本',
  account_deletion: '账号删除',
};

export const userRequestStatusLabels: Record<UserRequestStatus, string> = {
  submitted: '已提交',
  processing: '处理中',
  completed: '已完成',
  declined: '未受理',
  cancelled: '已取消',
};

export const supportCategoryLabels: Record<UserRequestSupportCategory, string> = {
  booking: '预约',
  safety: '内容安全',
  account: '账号',
  privacy: '隐私',
  other: '其他',
};

export const contentReportStatusLabels: Record<ContentReportStatus, string> = {
  pending: '待处理',
  investigating: '调查中',
  resolved: '已解决',
  rejected: '已驳回',
};

export const contentTargetLabels: Record<ContentReportTargetType, string> = {
  post: '作品',
  companion: '摄影师',
};

export const contentCategoryLabels: Record<ContentReportCategory, string> = {
  content_violation: '内容违规',
  safety: '安全问题',
  fraud: '欺诈',
  privacy_or_rights: '隐私或权利',
  other: '其他',
};

export function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(date);
}
export function displayValue(value?: string | null) {
  const normalized = String(value ?? '').trim();
  return normalized || '—';
}

export function statusTone(status: string): 'amber' | 'green' | 'red' | 'gray' | 'blue' {
  if (status === 'submitted' || status === 'pending') return 'amber';
  if (status === 'confirmed' || status === 'completed' || status === 'resolved') return 'green';
  if (status === 'declined' || status === 'rejected') return 'red';
  if (status === 'processing' || status === 'investigating') return 'blue';
  return 'gray';
}
