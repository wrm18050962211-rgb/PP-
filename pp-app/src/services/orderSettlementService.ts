import type { AppOrder, CancellationActor } from '../types/api';
import { formatMoney } from '../utils/money';

export type CancellationSettlement = Pick<
  AppOrder,
  | 'cancellationActor'
  | 'cancellationPhase'
  | 'cancellationReason'
  | 'cancellationPenaltyCents'
  | 'refundToCreatorCents'
  | 'compensationToCounterpartyCents'
  | 'platformFeeCents'
  | 'cancellationSummary'
  | 'cancelledAt'
  | 'depositStatus'
  | 'balanceStatus'
  | 'fundsStatus'
  | 'settlementStatus'
>;

const platformCommissionRate = 0.15;

export function calculateCancellationSettlement(order: AppOrder, actor: CancellationActor, reason?: string): CancellationSettlement {
  const depositCents = order.depositCents ?? (order.fundsStatus === 'deposit_escrowed' ? Math.min(order.amountCents, 10000) : 0);
  const balanceCents = order.balanceCents ?? Math.max(0, order.amountCents - depositCents);
  const hasBalancePaid = order.balanceStatus === 'paid' || order.fundsStatus === 'full_escrowed';
  const paidCents = depositCents + (hasBalancePaid ? balanceCents : 0);
  const phase = getCancellationPhase(order);
  const platformFeeCents = getPlatformFeeCents(phase, paidCents);

  let penaltyCents = 0;
  let refundToCreatorCents = paidCents;
  let compensationToCounterpartyCents = 0;
  let depositStatus: AppOrder['depositStatus'] = depositCents ? 'refunded' : order.depositStatus;
  let balanceStatus: AppOrder['balanceStatus'] = hasBalancePaid ? 'refunded' : order.balanceStatus;

  if (phase === 'paid_pending_confirm') {
    if (actor === 'creator') {
      penaltyCents = Math.round(depositCents * 0.3);
      compensationToCounterpartyCents = Math.max(0, penaltyCents - platformFeeCents);
      refundToCreatorCents = Math.max(0, paidCents - penaltyCents);
      depositStatus = penaltyCents >= depositCents ? 'forfeited' : 'refunded';
    }
  } else if (phase === 'confirmed_before_balance') {
    if (actor === 'creator') {
      penaltyCents = Math.min(depositCents, Math.round(order.amountCents * 0.15));
      compensationToCounterpartyCents = Math.max(0, penaltyCents - platformFeeCents);
      refundToCreatorCents = Math.max(0, paidCents - penaltyCents);
      depositStatus = penaltyCents >= depositCents ? 'forfeited' : 'refunded';
    } else if (actor === 'photographer') {
      compensationToCounterpartyCents = Math.round(order.amountCents * 0.1);
      refundToCreatorCents = paidCents + compensationToCounterpartyCents;
    }
  } else if (phase === 'full_escrowed') {
    if (actor === 'creator') {
      penaltyCents = Math.max(depositCents, Math.round(order.amountCents * 0.25));
      compensationToCounterpartyCents = Math.max(0, penaltyCents - platformFeeCents);
      refundToCreatorCents = Math.max(0, paidCents - penaltyCents);
      depositStatus = penaltyCents >= depositCents ? 'forfeited' : 'refunded';
      balanceStatus = 'refunded';
    } else if (actor === 'photographer') {
      compensationToCounterpartyCents = Math.round(order.amountCents * 0.2);
      refundToCreatorCents = paidCents + compensationToCounterpartyCents;
      balanceStatus = hasBalancePaid ? 'refunded' : order.balanceStatus;
    }
  }

  const summary = buildCancellationSummary({
    actor,
    phase,
    paidCents,
    penaltyCents,
    refundToCreatorCents,
    compensationToCounterpartyCents,
    platformFeeCents,
  });

  return {
    cancellationActor: actor,
    cancellationPhase: phase,
    cancellationReason: reason?.trim() || '用户在平台内提交取消',
    cancellationPenaltyCents: penaltyCents,
    refundToCreatorCents,
    compensationToCounterpartyCents,
    platformFeeCents,
    cancellationSummary: summary,
    cancelledAt: new Date().toISOString(),
    depositStatus,
    balanceStatus,
    fundsStatus: 'refunded',
    settlementStatus: 'cancelled',
  };
}

function getCancellationPhase(order: AppOrder): CancellationSettlement['cancellationPhase'] {
  if (order.status === 'paid_pending_confirm') return 'paid_pending_confirm';
  if (order.status === 'confirmed' && order.balanceStatus !== 'paid') return 'confirmed_before_balance';
  if (order.fundsStatus === 'full_escrowed' || order.balanceStatus === 'paid') return 'full_escrowed';
  if (order.status === 'completed') return 'completed';
  return 'other';
}

function getPlatformFeeCents(phase: CancellationSettlement['cancellationPhase'], paidCents: number) {
  if (phase === 'paid_pending_confirm') return 0;
  return Math.round(Math.max(0, paidCents) * platformCommissionRate);
}

function buildCancellationSummary({
  actor,
  phase,
  paidCents,
  penaltyCents,
  refundToCreatorCents,
  compensationToCounterpartyCents,
  platformFeeCents,
}: {
  actor: CancellationActor;
  phase: CancellationSettlement['cancellationPhase'];
  paidCents: number;
  penaltyCents: number;
  refundToCreatorCents: number;
  compensationToCounterpartyCents: number;
  platformFeeCents: number;
}) {
  const actorText = actor === 'creator' ? '创作者' : actor === 'photographer' ? '摄影师' : '管理员';
  const phaseText =
    phase === 'paid_pending_confirm'
      ? '待确认'
      : phase === 'confirmed_before_balance'
        ? '已确认且尾款未托管'
        : phase === 'full_escrowed'
          ? '尾款已托管'
          : phase === 'completed'
            ? '已完成'
            : '其他';

  return `${actorText}在${phaseText}阶段取消；已托管${formatMoney(paidCents)}，违约扣除${formatMoney(penaltyCents)}，退还创作者${formatMoney(refundToCreatorCents)}，赔付对方${formatMoney(compensationToCounterpartyCents)}，平台费用${formatMoney(platformFeeCents)}。`;
}
