import type { OrderStatus, ReviewStatus } from '../types/api';

export const orderStatusText: Record<OrderStatus, string> = {
  pending_payment: '待支付',
  paid_pending_confirm: '待确认',
  confirmed: '已确认',
  in_service: '服务中',
  completed: '已完成',
  cancelled: '已取消',
  refunding: '退款中',
  refunded: '已退款',
  disputed: '争议处理中',
};

export const reviewStatusFromApi: Record<string, ReviewStatus> = {
  draft: '草稿',
  pending: '待审核',
  pending_review: '待审核',
  approved: '已通过',
  rejected: '需修改',
  needs_change: '需修改',
};

export function getOrderSteps(status: OrderStatus) {
  const steps = ['已支付', '待陪拍者确认', '服务开始', '完成评价'];
  const currentStepByStatus: Record<OrderStatus, number> = {
    pending_payment: 0,
    paid_pending_confirm: 1,
    confirmed: 2,
    in_service: 3,
    completed: 4,
    cancelled: 1,
    refunding: 1,
    refunded: 1,
    disputed: 2,
  };

  return {
    steps,
    currentStep: currentStepByStatus[status],
  };
}
