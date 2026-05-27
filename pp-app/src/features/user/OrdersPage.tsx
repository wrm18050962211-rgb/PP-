import {
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock3,
  MapPin,
  MessageCircle,
  ReceiptText,
  RotateCcw,
  Star,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import type { AppOrder, OrderStatus } from '../../types/domain';
import { formatMoney } from '../../utils/money';

type OrderAction =
  | { type: 'cancel'; order: AppOrder }
  | { type: 'review'; order: AppOrder }
  | { type: 'refund'; order: AppOrder }
  | null;

const statusTabs: Array<{ key: OrderStatus | 'all'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'paid_pending_confirm', label: '待确认' },
  { key: 'confirmed', label: '已确认' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
  { key: 'refunding', label: '退款中' },
];

const statusMeta: Record<string, { label: string; tone: string }> = {
  paid_pending_confirm: { label: '待确认', tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
  confirmed: { label: '已确认', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  completed: { label: '已完成', tone: 'bg-blue-50 text-blue-700 ring-blue-100' },
  cancelled: { label: '已取消', tone: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
  refunding: { label: '退款中', tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
};

const reviewStorageKey = 'pp-reviewed-orders';

export function OrdersPage() {
  const { orders, updateOrderStatus } = useAppData();
  const [activeStatus, setActiveStatus] = useState<OrderStatus | 'all'>('all');
  const [activeAction, setActiveAction] = useState<OrderAction>(null);
  const [reviewedOrderIds, setReviewedOrderIds] = useState<string[]>(() => loadReviewedOrderIds());

  const filteredOrders = useMemo(
    () => orders.filter((order) => activeStatus === 'all' || order.status === activeStatus),
    [activeStatus, orders],
  );

  function submitReview(orderId: string) {
    const nextIds = Array.from(new Set([...reviewedOrderIds, orderId]));
    setReviewedOrderIds(nextIds);
    localStorage.setItem(reviewStorageKey, JSON.stringify(nextIds));
    setActiveAction(null);
  }

  return (
    <div className="min-h-dvh pp-page px-4 py-5">
      <header>
        <p className="text-xs font-semibold text-[#e85d75]">我的预约</p>
        <h1 className="mt-1 text-2xl font-bold text-[#3f302c]">订单</h1>
      </header>

      <div className="scrollbar-none -mx-4 mt-5 flex gap-2 overflow-x-auto px-4">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            className={`h-9 shrink-0 rounded-full px-4 text-sm font-bold ${
              activeStatus === tab.key ? 'bg-[#3f302c] text-white' : 'bg-white/78 text-[#7a6b64] ring-1 ring-[#eadfd8]'
            }`}
            onClick={() => setActiveStatus(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {filteredOrders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            reviewed={reviewedOrderIds.includes(order.id)}
            onCancel={() => setActiveAction({ type: 'cancel', order })}
            onReview={() => setActiveAction({ type: 'review', order })}
            onRefund={() => setActiveAction({ type: 'refund', order })}
          />
        ))}
      </div>

      {!filteredOrders.length && (
        <div className="mt-16 text-center">
          <ReceiptText className="mx-auto text-zinc-300" size={48} />
          <p className="mt-4 text-sm font-semibold text-[#8f8078]">当前没有这个状态的订单</p>
        </div>
      )}

      {activeAction?.type === 'cancel' && (
        <ConfirmCancelDialog
          order={activeAction.order}
          onClose={() => setActiveAction(null)}
          onConfirm={() => {
            updateOrderStatus(activeAction.order.id, 'cancelled');
            setActiveAction(null);
          }}
        />
      )}
      {activeAction?.type === 'review' && (
        <ReviewDialog order={activeAction.order} onClose={() => setActiveAction(null)} onSubmit={() => submitReview(activeAction.order.id)} />
      )}
      {activeAction?.type === 'refund' && <RefundDialog order={activeAction.order} onClose={() => setActiveAction(null)} />}
    </div>
  );
}

function OrderCard({
  order,
  reviewed,
  onCancel,
  onReview,
  onRefund,
}: {
  order: AppOrder;
  reviewed: boolean;
  onCancel: () => void;
  onReview: () => void;
  onRefund: () => void;
}) {
  const addOnTotal = order.addOns?.reduce((total, item) => total + item.amountCents, 0) ?? 0;
  const basePrice = Math.max(order.amountCents - addOnTotal, 0);
  const canCancel = order.status === 'paid_pending_confirm' || order.status === 'confirmed';
  const canReview = order.status === 'completed';
  const meta = statusMeta[order.status] ?? { label: order.statusText, tone: 'bg-zinc-100 text-zinc-600 ring-zinc-200' };

  return (
    <article className="rounded-[22px] pp-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#a99b94]">{order.orderNo}</p>
          <h2 className="mt-1 truncate text-lg font-bold text-[#3f302c]">{order.title}</h2>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ${meta.tone}`}>{meta.label}</span>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-[18px] bg-[#fff5f1] p-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#e85d75] ring-1 ring-[#eadfd8]">
          <Camera size={21} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[#a99b94]">陪拍者信息</p>
          <p className="mt-0.5 text-sm font-bold text-[#3f302c]">{order.companion}</p>
          <p className="truncate text-xs text-[#8f8078]">{order.activityName ?? order.title}</p>
        </div>
        <Link to={`/consumer/messages/${order.id}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#3f302c] text-white" aria-label="进入消息页">
          <MessageCircle size={17} />
        </Link>
      </div>

      <div className="mt-4 grid gap-3 text-sm">
        <DetailLine icon={<Camera size={17} />} label="活动类型" value={order.activityName ?? order.title} />
        <DetailLine icon={<MapPin size={17} />} label="地点" value={order.place} />
        <DetailLine icon={<CalendarDays size={17} />} label="日期和时间" value={`${order.dateLabel ?? ''} ${order.timeLabel ?? order.time}`.trim()} />
        <DetailLine icon={<Clock3 size={17} />} label="时长" value={order.durationLabel ?? `${order.durationMinutes ?? 0}分钟`} />
        <DetailLine icon={<ReceiptText size={17} />} label="订单状态" value={meta.label} />
      </div>

      <div className="mt-4 space-y-2 rounded-[18px] border border-[#eadfd8] bg-white/62 p-3">
        <PriceLine label="基础价格" value={formatMoney(basePrice)} />
        <PriceLine label="精修加购" value={addOnTotal ? formatAddOns(order) : '未加购'} muted={!addOnTotal} />
        <div className="border-t border-zinc-100 pt-2">
          <PriceLine label="总价" value={formatMoney(order.amountCents)} strong />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Link
          to={`/consumer/messages/${order.id}`}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-[#3f302c] text-sm font-bold text-white"
        >
          <MessageCircle size={17} />
          进入消息页
        </Link>
        {canCancel && (
          <button
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-[#f2e8e1] text-sm font-bold text-[#6f625d]"
            onClick={onCancel}
            type="button"
          >
            <XCircle size={17} />
            取消订单
          </button>
        )}
        {canReview && (
          <button
            className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm font-bold ${
              reviewed ? 'pp-safe' : 'pp-primary'
            }`}
            disabled={reviewed}
            onClick={onReview}
            type="button"
          >
            <Star size={17} />
            {reviewed ? '已评价' : '去评价'}
          </button>
        )}
        {order.status === 'refunding' && (
          <button className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-[#fff1f2] text-sm font-bold text-[#e85d75]" onClick={onRefund} type="button">
            <RotateCcw size={17} />
            退款进度
          </button>
        )}
        {order.status === 'cancelled' && (
          <span className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-[#f2e8e1] text-sm font-bold text-[#a99b94]">
            <CheckCircle2 size={17} />
            已取消
          </span>
        )}
      </div>
    </article>
  );
}

function ConfirmCancelDialog({ order, onClose, onConfirm }: { order: AppOrder; onClose: () => void; onConfirm: () => void }) {
  return (
    <ActionSheet title="取消订单" onClose={onClose}>
      <p className="text-sm leading-6 text-zinc-500">
        确认取消 {order.companion} 的「{order.activityName ?? order.title}」订单吗？MVP 版本会直接将订单标记为已取消。
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button className="h-11 rounded-full bg-zinc-100 text-sm font-bold text-zinc-700" onClick={onClose} type="button">
          先不取消
        </button>
        <button className="h-11 rounded-full bg-zinc-950 text-sm font-bold text-white" onClick={onConfirm} type="button">
          确认取消
        </button>
      </div>
    </ActionSheet>
  );
}

function ReviewDialog({ order, onClose, onSubmit }: { order: AppOrder; onClose: () => void; onSubmit: () => void }) {
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');

  return (
    <ActionSheet title="评价订单" onClose={onClose}>
      <p className="text-sm text-zinc-500">给 {order.companion} 的这次陪拍体验打个分。</p>
      <div className="mt-4 flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            className={`grid h-10 w-10 place-items-center rounded-full ${value <= rating ? 'bg-rose-500 text-white' : 'bg-zinc-100 text-zinc-300'}`}
            onClick={() => setRating(value)}
            type="button"
            aria-label={`${value}星`}
          >
            <Star size={18} fill="currentColor" />
          </button>
        ))}
      </div>
      <textarea
        className="mt-4 min-h-24 w-full resize-none rounded-[10px] bg-zinc-100 p-3 text-sm outline-none"
        maxLength={120}
        onChange={(event) => setContent(event.target.value)}
        placeholder="写一句评价，帮助其他用户参考"
        value={content}
      />
      <button className="mt-4 h-11 w-full rounded-full bg-rose-500 text-sm font-bold text-white" onClick={onSubmit} type="button">
        提交评价
      </button>
    </ActionSheet>
  );
}

function RefundDialog({ order, onClose }: { order: AppOrder; onClose: () => void }) {
  return (
    <ActionSheet title="退款进度" onClose={onClose}>
      <div className="rounded-[10px] bg-rose-50 p-3">
        <p className="text-sm font-bold text-rose-700">预计退款 {formatMoney(order.amountCents)}</p>
        <p className="mt-1 text-xs text-rose-600">平台正在核对服务状态，退款成功后会原路返回。</p>
      </div>
      <div className="mt-4 space-y-3">
        <RefundStep title="已提交退款申请" desc="用户发起取消或退款申请" done />
        <RefundStep title="平台处理中" desc="核对订单与托管款项" done />
        <RefundStep title="退款到账" desc="到账时间以支付渠道为准" />
      </div>
    </ActionSheet>
  );
}

function ActionSheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#3f302c]/30 px-4 pb-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[22px] bg-[#fffaf6] p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#3f302c]">{title}</h2>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-[#f2e8e1] text-[#7a6b64]" onClick={onClose} type="button" aria-label="关闭">
            <XCircle size={18} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function RefundStep({ title, desc, done }: { title: string; desc: string; done?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${done ? 'bg-rose-500 text-white' : 'bg-zinc-100 text-zinc-300'}`}>
        <CheckCircle2 size={15} />
      </span>
      <span>
        <span className="block text-sm font-bold text-zinc-900">{title}</span>
        <span className="mt-0.5 block text-xs text-zinc-500">{desc}</span>
      </span>
    </div>
  );
}

function DetailLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-zinc-400">{icon}</span>
      <span className="w-20 shrink-0 text-[#7a6b64]">{label}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-[#3f302c]">{value}</span>
    </div>
  );
}

function PriceLine({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`${strong ? 'font-bold text-[#3f302c]' : 'text-[#7a6b64]'} text-sm`}>{label}</span>
      <span className={`${strong ? 'text-lg font-bold' : 'text-sm font-semibold'} ${muted ? 'text-[#b0a29b]' : 'text-[#3f302c]'}`}>{value}</span>
    </div>
  );
}

function formatAddOns(order: AppOrder) {
  const addOns = order.addOns ?? [];
  const count = addOns.reduce((total, item) => total + item.quantity, 0);
  const amount = addOns.reduce((total, item) => total + item.amountCents, 0);
  return `${count}张 ${formatMoney(amount)}`;
}

function loadReviewedOrderIds() {
  try {
    const raw = localStorage.getItem(reviewStorageKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
