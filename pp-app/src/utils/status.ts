import type { OrderStatus, ReviewStatus } from '../types/api';

export const orderStatusText: Record<OrderStatus, string> = {
  pending_payment: '待确认',
  paid_pending_confirm: '待确认',
  confirmed: '已确认',
  in_service: '已确认',
  completed: '已完成',
  cancelled: '已取消',
  refunding: '已取消',
  refunded: '已取消',
  disputed: '已取消',
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
  const steps = ['待确认', '已确认', '已完成', '已取消'];
  const currentStepByStatus: Record<OrderStatus, number> = {
    pending_payment: 0,
    paid_pending_confirm: 1,
    confirmed: 2,
    in_service: 2,
    completed: 3,
    cancelled: 4,
    refunding: 4,
    refunded: 4,
    disputed: 4,
  };

  return {
    steps,
    currentStep: currentStepByStatus[status],
  };
}
