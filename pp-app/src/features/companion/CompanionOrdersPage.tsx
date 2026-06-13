import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  MapPin,
  MessageCircle,
  ReceiptText,
  RotateCcw,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import type { AppOrder, OrderStatus } from '../../types/domain';
import { formatMoney } from '../../utils/money';

type CompanionOrderTab = OrderStatus | 'today';
type ActiveDialog =
  | { type: 'detail'; order: AppOrder }
  | { type: 'confirm'; order: AppOrder }
  | { type: 'complete'; order: AppOrder }
  | { type: 'cancel'; order: AppOrder }
  | null;

const tabs: Array<{ key: CompanionOrderTab; label: string }> = [
  { key: 'paid_pending_confirm', label: '待确认' },
  { key: 'confirmed', label: '已确认' },
  { key: 'today', label: '今日行程' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
  { key: 'refunding', label: '退款中' },
];

const statusMeta: Record<string, { label: string; tone: string }> = {
  paid_pending_confirm: { label: '待确认', tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
  confirmed: { label: '已确认', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  in_service: { label: '服务中', tone: 'bg-cyan-50 text-cyan-700 ring-cyan-100' },
  completed: { label: '已完成', tone: 'bg-blue-50 text-blue-700 ring-blue-100' },
  cancelled: { label: '已取消', tone: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
  refunding: { label: '退款中', tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
};

export function CompanionOrdersPage() {
  const { orders, updateOrderStatus } = useAppData();
  const [activeTab, setActiveTab] = useState<CompanionOrderTab>('paid_pending_confirm');
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);

  const counts = useMemo(() => {
    return tabs.reduce<Record<string, number>>((next, tab) => {
      next[tab.key] = tab.key === 'today' ? orders.filter(isTodayItinerary).length : orders.filter((order) => order.status === tab.key).length;
      return next;
    }, {});
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (activeTab === 'today') return orders.filter(isTodayItinerary);
    return orders.filter((order) => order.status === activeTab);
  }, [activeTab, orders]);

  return (
    <div className="min-h-dvh bg-zinc-50 px-4 py-5">
      <header className="flex items-start gap-3">
        <Link className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-200" to="/companion/mine" aria-label="返回我的">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-rose-500">陪拍者工作台</p>
          <h1 className="mt-1 text-2xl font-bold">订单管理</h1>
        </div>
        <Link className="grid h-10 w-10 place-items-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-200" to="/companion/income" aria-label="收入页面">
          <ReceiptText size={19} />
        </Link>
      </header>

      <div className="scrollbar-none -mx-4 mt-5 flex gap-2 overflow-x-auto px-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`h-9 shrink-0 rounded-full px-4 text-sm font-bold ${
              activeTab === tab.key ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-500 ring-1 ring-zinc-200'
            }`}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
            <span className="ml-1 text-xs opacity-70">{counts[tab.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {filteredOrders.map((order) => (
          <CompanionOrderCard
            key={order.id}
            order={order}
            onCancel={() => setActiveDialog({ type: 'cancel', order })}
            onConfirm={() => setActiveDialog({ type: 'confirm', order })}
            onComplete={() => setActiveDialog({ type: 'complete', order })}
            onDetail={() => setActiveDialog({ type: 'detail', order })}
          />
        ))}
      </div>

      {!filteredOrders.length && (
        <div className="mt-16 text-center">
          <FileText className="mx-auto text-zinc-300" size={48} />
          <p className="mt-4 text-sm font-semibold text-zinc-500">当前没有这个分类的订单</p>
        </div>
      )}

      {activeDialog?.type === 'detail' && <OrderDetailSheet order={activeDialog.order} onClose={() => setActiveDialog(null)} />}
      {activeDialog?.type === 'confirm' && (
        <ConfirmSheet
          title="确认接单"
          desc={`确认接下订单 ${activeDialog.order.orderNo} 后，用户端会看到订单进入已确认状态，请按约定时间到达。`}
          primaryText="确认接单"
          onClose={() => setActiveDialog(null)}
          onConfirm={() => {
            updateOrderStatus(activeDialog.order.id, 'confirmed');
            setActiveDialog(null);
          }}
        />
      )}
      {activeDialog?.type === 'complete' && (
        <ConfirmSheet
          title="确认完成"
          desc={`确认「${activeDialog.order.activityName ?? activeDialog.order.title}」已完成服务吗？确认后订单会进入已完成，收入进入结算流程。`}
          primaryText="确认完成"
          onClose={() => setActiveDialog(null)}
          onConfirm={() => {
            updateOrderStatus(activeDialog.order.id, 'completed');
            setActiveDialog(null);
          }}
        />
      )}
      {activeDialog?.type === 'cancel' && (
        <ConfirmSheet
          title="取消申请"
          desc={`确认申请取消订单 ${activeDialog.order.orderNo} 吗？MVP 版会先直接标记为已取消。`}
          primaryText="提交取消"
          onClose={() => setActiveDialog(null)}
          onConfirm={() => {
            updateOrderStatus(activeDialog.order.id, 'cancelled');
            setActiveDialog(null);
          }}
        />
      )}
    </div>
  );
}

function CompanionOrderCard({
  order,
  onCancel,
  onConfirm,
  onComplete,
  onDetail,
}: {
  order: AppOrder;
  onCancel: () => void;
  onConfirm: () => void;
  onComplete: () => void;
  onDetail: () => void;
}) {
  const meta = statusMeta[order.status] ?? { label: order.statusText, tone: 'bg-zinc-100 text-zinc-600 ring-zinc-200' };
  const canConfirm = order.status === 'paid_pending_confirm';
  const canComplete = order.status === 'confirmed' || order.status === 'in_service';
  const canCancel = order.status === 'paid_pending_confirm' || order.status === 'confirmed';

  return (
    <article className="rounded-[10px] border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-400">{order.orderNo}</p>
          <h2 className="mt-1 truncate text-lg font-bold">{order.activityName ?? order.title}</h2>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ${meta.tone}`}>{meta.label}</span>
      </div>

      <div className="mt-4 grid gap-3 text-sm">
        <InfoLine icon={<UserRound size={17} />} label="用户" value={order.creatorName || order.creatorPhone || '预约用户'} />
        <InfoLine icon={<MapPin size={17} />} label="地点" value={order.place} />
        <InfoLine icon={<CalendarDays size={17} />} label="时间" value={`${order.dateLabel ?? ''} ${order.timeLabel ?? order.time}`.trim()} />
        <InfoLine icon={<Clock3 size={17} />} label="时长" value={order.durationLabel ?? `${order.durationMinutes ?? 0}分钟`} />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-[10px] bg-zinc-50 px-3 py-3">
        <span className="text-sm font-semibold text-zinc-500">订单金额</span>
        <span className="text-lg font-bold text-zinc-950">{formatMoney(order.amountCents)}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="flex h-10 items-center justify-center gap-2 rounded-full bg-white text-sm font-bold text-zinc-700 ring-1 ring-zinc-200" onClick={onDetail} type="button">
          <FileText size={17} />
          详情
        </button>
        <Link className="flex h-10 items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-bold text-white" to={`/consumer/messages/${order.id}`}>
          <MessageCircle size={17} />
          沟通
        </Link>
        {canConfirm && (
          <button className="flex h-10 items-center justify-center gap-2 rounded-full bg-emerald-600 text-sm font-bold text-white" onClick={onConfirm} type="button">
            <CheckCircle2 size={17} />
            接单
          </button>
        )}
        {canComplete && (
          <button className="flex h-10 items-center justify-center gap-2 rounded-full bg-emerald-600 text-sm font-bold text-white" onClick={onComplete} type="button">
            <CheckCircle2 size={17} />
            完成
          </button>
        )}
        {canCancel && (
          <button className="flex h-10 items-center justify-center gap-2 rounded-full bg-zinc-100 text-sm font-bold text-zinc-700" onClick={onCancel} type="button">
            <XCircle size={17} />
            取消申请
          </button>
        )}
        {order.status === 'refunding' && (
          <span className="col-span-2 flex h-10 items-center justify-center gap-2 rounded-full bg-rose-50 text-sm font-bold text-rose-600">
            <RotateCcw size={17} />
            等待平台处理退款
          </span>
        )}
      </div>
    </article>
  );
}

function OrderDetailSheet({ order, onClose }: { order: AppOrder; onClose: () => void }) {
  const addOnTotal = order.addOns?.reduce((total, item) => total + item.amountCents, 0) ?? 0;
  const basePrice = Math.max(order.amountCents - addOnTotal, 0);

  return (
    <ActionSheet title="订单详情" onClose={onClose}>
      <div className="space-y-3">
        <InfoLine icon={<ReceiptText size={17} />} label="订单号" value={order.orderNo} />
        <InfoLine icon={<FileText size={17} />} label="项目" value={order.activityName ?? order.title} />
        <InfoLine icon={<MapPin size={17} />} label="地点" value={order.place} />
        <InfoLine icon={<CalendarDays size={17} />} label="时间" value={`${order.dateLabel ?? ''} ${order.timeLabel ?? order.time}`.trim()} />
        <InfoLine icon={<Clock3 size={17} />} label="时长" value={order.durationLabel ?? `${order.durationMinutes ?? 0}分钟`} />
      </div>
      <div className="mt-4 space-y-2 rounded-[10px] border border-zinc-100 p-3">
        <AmountLine label="基础价格" value={formatMoney(basePrice)} />
        <AmountLine label="加购项目" value={addOnTotal ? formatAddOns(order) : '未加购'} muted={!addOnTotal} />
        <div className="border-t border-zinc-100 pt-2">
          <AmountLine label="订单总额" value={formatMoney(order.amountCents)} strong />
        </div>
      </div>
    </ActionSheet>
  );
}

function ConfirmSheet({
  title,
  desc,
  primaryText,
  onClose,
  onConfirm,
}: {
  title: string;
  desc: string;
  primaryText: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ActionSheet title={title} onClose={onClose}>
      <p className="text-sm leading-6 text-zinc-500">{desc}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button className="h-11 rounded-full bg-zinc-100 text-sm font-bold text-zinc-700" onClick={onClose} type="button">
          先不操作
        </button>
        <button className="h-11 rounded-full bg-zinc-950 text-sm font-bold text-white" onClick={onConfirm} type="button">
          {primaryText}
        </button>
      </div>
    </ActionSheet>
  );
}

function ActionSheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 px-4 pb-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[10px] bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-500" onClick={onClose} type="button" aria-label="关闭">
            <XCircle size={18} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function InfoLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-zinc-400">{icon}</span>
      <span className="w-16 shrink-0 text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-zinc-900">{value}</span>
    </div>
  );
}

function AmountLine({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`${strong ? 'font-bold text-zinc-950' : 'text-zinc-500'} text-sm`}>{label}</span>
      <span className={`${strong ? 'text-lg font-bold' : 'text-sm font-semibold'} ${muted ? 'text-zinc-400' : 'text-zinc-950'}`}>{value}</span>
    </div>
  );
}

function formatAddOns(order: AppOrder) {
  const addOns = order.addOns ?? [];
  const count = addOns.reduce((total, item) => total + item.quantity, 0);
  const amount = addOns.reduce((total, item) => total + item.amountCents, 0);
  return `${count}项 ${formatMoney(amount)}`;
}

function isTodayItinerary(order: AppOrder) {
  if (order.status !== 'confirmed' && order.status !== 'in_service') return false;
  if (order.dateLabel === '今天') return true;
  if (!order.startAt) return false;
  return toDateKey(order.startAt) === toDateKey(new Date().toISOString());
}

function toDateKey(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}
