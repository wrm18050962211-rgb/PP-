import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  ImagePlus,
  MapPin,
  MessageCircle,
  ReceiptText,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { listFeedPosts } from '../../services/feedService';
import {
  isOrderWorkConfirmed,
  listOrderWorkRecords,
  markOrderWorkDisputed,
  saveOrderWorkRecord,
  type OrderWorkRecord,
} from '../../services/orderWorkService';
import { calculateCancellationSettlement } from '../../services/orderSettlementService';
import type { AppOrder, OrderStatus } from '../../types/domain';
import { formatMoney } from '../../utils/money';
import { OrderWorkDialog } from '../user/OrdersPage';

type CompanionOrderTab = OrderStatus;
type WorkEditTab = 'not_started' | 'editing' | 'done';
type ActiveDialog =
  | { type: 'detail'; order: AppOrder }
  | { type: 'confirm'; order: AppOrder }
  | { type: 'complete'; order: AppOrder }
  | { type: 'cancel'; order: AppOrder }
  | null;

type WorkEditStatus = {
  key: WorkEditTab;
  label: string;
  desc: string;
};

const tabs: Array<{ key: CompanionOrderTab; label: string }> = [
  { key: 'paid_pending_confirm', label: '待确认' },
  { key: 'confirmed', label: '已确认' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
];

const workTabs: WorkEditStatus[] = [
  { key: 'not_started', label: '未编辑', desc: '已完成订单，还没有上传或填写成片信息' },
  { key: 'editing', label: '正在编辑', desc: '已进入成片协作，等待补充内容或双方确认' },
  { key: 'done', label: '已完成编辑', desc: '创作者和摄影师已确认，可选择同步主页' },
];

const statusMeta: Record<string, { label: string; tone: string }> = {
  paid_pending_confirm: { label: '待确认', tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
  confirmed: { label: '已确认', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  in_service: { label: '已确认', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  completed: { label: '已完成', tone: 'bg-blue-50 text-blue-700 ring-blue-100' },
  cancelled: { label: '已取消', tone: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
  refunding: { label: '已取消', tone: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
  refunded: { label: '已取消', tone: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
  disputed: { label: '已取消', tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
};

export function CompanionOrdersPage() {
  const { orders, updateOrderFunding, updateOrderStatus } = useAppData();
  const [searchParams] = useSearchParams();
  const workMode = searchParams.get('work') === '1';
  const [activeTab, setActiveTab] = useState<CompanionOrderTab>('paid_pending_confirm');
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);

  const counts = useMemo(() => {
    return tabs.reduce<Record<string, number>>((next, tab) => {
      next[tab.key] = orders.filter((order) => getDisplayOrderStatus(order.status) === tab.key).length;
      return next;
    }, {});
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => getDisplayOrderStatus(order.status) === activeTab);
  }, [activeTab, orders]);

  if (workMode) {
    return <CompanionWorkEditPage />;
  }

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

      <section className="mt-4 rounded-[14px] bg-white p-3 text-zinc-700 ring-1 ring-zinc-200">
        <p className="text-xs font-black text-rose-500">订单分为 4 个主状态</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          待确认先沟通接单，已确认代表款项托管并达成交易意向；完成后可共同编辑上传作品，取消会进入平台违约/退款处理。
        </p>
      </section>

      <div className="scrollbar-none -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1">
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
          desc={`确认接下订单 ${activeDialog.order.orderNo} 后，订单进入已确认状态，用户支付的款项会先托管在平台资金池，拍摄完成后再进入结算。`}
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
          desc={`确认「${activeDialog.order.activityName ?? activeDialog.order.title}」已完成服务吗？确认后订单进入已完成，双方可以在编辑作品里共同上传成片。`}
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
          desc={
            activeDialog.order.status === 'confirmed' || activeDialog.order.status === 'in_service'
              ? `确认申请取消订单 ${activeDialog.order.orderNo} 吗？已确认订单由摄影师取消时，会从摄影师平台押金中扣除违约金，平台抽点后赔付给创作者。`
              : `确认申请取消订单 ${activeDialog.order.orderNo} 吗？待确认阶段摄影师未接单，可直接取消。`
          }
          primaryText="提交取消"
          onClose={() => setActiveDialog(null)}
          onConfirm={() => {
            updateOrderFunding(activeDialog.order.id, calculateCancellationSettlement(activeDialog.order, 'photographer'));
            updateOrderStatus(activeDialog.order.id, 'cancelled');
            setActiveDialog(null);
          }}
        />
      )}
    </div>
  );
}

function CompanionWorkEditPage() {
  const { orders, updateOrderFunding } = useAppData();
  const [activeTab, setActiveTab] = useState<WorkEditTab>('not_started');
  const [activeWorkOrder, setActiveWorkOrder] = useState<AppOrder | null>(null);
  const [workRecords, setWorkRecords] = useState<OrderWorkRecord[]>(() => listOrderWorkRecords());
  const posts = useMemo(() => listFeedPosts(), []);
  const workByOrderId = useMemo(() => new Map(workRecords.map((record) => [record.orderId, record])), [workRecords]);
  const completedOrders = useMemo(() => orders.filter((order) => getDisplayOrderStatus(order.status) === 'completed'), [orders]);
  const counts = useMemo(() => {
    return workTabs.reduce<Record<WorkEditTab, number>>((next, tab) => {
      next[tab.key] = completedOrders.filter((order) => getWorkEditStatus(workByOrderId.get(order.id)) === tab.key).length;
      return next;
    }, { not_started: 0, editing: 0, done: 0 });
  }, [completedOrders, workByOrderId]);
  const visibleOrders = useMemo(
    () => completedOrders.filter((order) => getWorkEditStatus(workByOrderId.get(order.id)) === activeTab),
    [activeTab, completedOrders, workByOrderId],
  );
  const activeWorkRecord = activeWorkOrder ? workByOrderId.get(activeWorkOrder.id) : undefined;

  function submitWorkRecord(record: OrderWorkRecord) {
    setWorkRecords(saveOrderWorkRecord(record));
    setActiveWorkOrder(null);
  }

  return (
    <div className="min-h-dvh bg-zinc-50 px-4 py-5">
      <header className="flex items-start gap-3">
        <Link className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-200" to="/companion/mine" aria-label="返回我的">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-rose-500">陪拍者工作台</p>
          <h1 className="mt-1 text-2xl font-bold">编辑作品</h1>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-200" aria-hidden>
          <ImagePlus size={19} />
        </span>
      </header>

      <section className="mt-4 rounded-[14px] bg-white p-3 text-zinc-700 ring-1 ring-zinc-200">
        <p className="text-xs font-black text-rose-500">作品按 3 个编辑状态分类</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          这里只显示已完成订单的共同成片。未编辑代表还没开始上传；正在编辑代表已上传或填写但未双方确认；已编辑完成代表双方确认后可同步到主页。
        </p>
      </section>

      <div className="scrollbar-none -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {workTabs.map((tab) => (
          <button
            key={tab.key}
            className={`h-9 shrink-0 rounded-full px-4 text-sm font-bold ${
              activeTab === tab.key ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-500 ring-1 ring-zinc-200'
            }`}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
            <span className="ml-1 text-xs opacity-70">{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs font-semibold leading-5 text-zinc-400">{workTabs.find((tab) => tab.key === activeTab)?.desc}</p>

      <div className="mt-4 space-y-4">
        {visibleOrders.map((order) => (
          <WorkEditOrderCard key={order.id} order={order} record={workByOrderId.get(order.id)} onManage={() => setActiveWorkOrder(order)} />
        ))}
      </div>

      {!visibleOrders.length && (
        <div className="mt-16 text-center">
          <FileText className="mx-auto text-zinc-300" size={48} />
          <p className="mt-4 text-sm font-semibold text-zinc-500">当前没有这个编辑状态的作品</p>
        </div>
      )}

      {activeWorkOrder ? (
        <OrderWorkDialog
          order={activeWorkOrder}
          post={posts.find((post) => post.id === activeWorkOrder.postId)}
          record={activeWorkRecord}
          onClose={() => setActiveWorkOrder(null)}
          onSubmit={submitWorkRecord}
          onDispute={(record, reason) => {
            submitWorkRecord(markOrderWorkDisputed(record, reason));
            updateOrderFunding(activeWorkOrder.id, { fundsStatus: 'frozen', settlementStatus: 'frozen' });
          }}
        />
      ) : null}
    </div>
  );
}

function WorkEditOrderCard({ order, record, onManage }: { order: AppOrder; record?: OrderWorkRecord; onManage: () => void }) {
  const status = getWorkEditStatus(record);
  const statusLabel = workTabs.find((tab) => tab.key === status)?.label ?? '未编辑';
  const actionText = status === 'not_started' ? '开始编辑' : status === 'editing' ? '继续编辑' : '查看成片';
  const imageCount = record?.imageUrls.length ?? 0;

  return (
    <article className="rounded-[10px] border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-400">{order.orderNo}</p>
          <h2 className="mt-1 truncate text-lg font-bold">{order.activityName ?? order.title}</h2>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ${getWorkEditTone(status)}`}>{statusLabel}</span>
      </div>

      <div className="mt-4 grid gap-3 text-sm">
        <InfoLine icon={<UserRound size={17} />} label="创作者" value={order.creatorName || order.creatorPhone || order.creatorId || '预约用户'} />
        <InfoLine icon={<MapPin size={17} />} label="地点" value={order.place} />
        <InfoLine icon={<CalendarDays size={17} />} label="时间" value={`${order.dateLabel ?? ''} ${order.timeLabel ?? order.time}`.trim()} />
        <InfoLine icon={<Clock3 size={17} />} label="时长" value={order.durationLabel ?? `${order.durationMinutes ?? 0}分钟`} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-[10px] bg-zinc-50 p-3 text-center">
        <WorkMetric label="照片/Live" value={`${imageCount}/9`} />
        <WorkMetric label="创作者确认" value={record?.creatorConfirmed ? '已确认' : '未确认'} />
        <WorkMetric label="摄影师确认" value={record?.photographerConfirmed ? '已确认' : '未确认'} />
      </div>

      <button className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-bold text-white" onClick={onManage} type="button">
        <ImagePlus size={17} />
        {actionText}
      </button>
    </article>
  );
}

function WorkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-zinc-400">{label}</p>
      <p className="mt-1 text-xs font-black text-zinc-900">{value}</p>
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
  const balanceRequired = Boolean(order.balanceCents && order.balanceStatus !== 'paid');
  const canComplete = (order.status === 'confirmed' || order.status === 'in_service') && !balanceRequired;
  const canCancel = order.status === 'paid_pending_confirm' || order.status === 'confirmed';
  const creatorDisplayName = order.creatorName || order.creatorId || '预约用户';
  const creatorPhone = order.creatorPhone || '未绑定手机号';

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
        <InfoLine icon={<UserRound size={17} />} label="用户" value={creatorDisplayName} />
        <InfoLine icon={<UserRound size={17} />} label="手机号" value={creatorPhone} />
        <InfoLine icon={<MapPin size={17} />} label="地点" value={order.place} />
        <InfoLine icon={<CalendarDays size={17} />} label="时间" value={`${order.dateLabel ?? ''} ${order.timeLabel ?? order.time}`.trim()} />
        <InfoLine icon={<Clock3 size={17} />} label="时长" value={order.durationLabel ?? `${order.durationMinutes ?? 0}分钟`} />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-[10px] bg-zinc-50 px-3 py-3">
        <span className="text-sm font-semibold text-zinc-500">订单金额</span>
        <span className="text-lg font-bold text-zinc-950">{formatMoney(order.amountCents)}</span>
      </div>
      {balanceRequired ? (
        <div className="mt-3 rounded-[10px] bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
          尾款未托管，暂不开始拍摄，也不要交付底片。请等待创作者在平台内支付尾款 {formatMoney(order.balanceCents ?? 0)}。
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="flex h-10 items-center justify-center gap-2 rounded-full bg-white text-sm font-bold text-zinc-700 ring-1 ring-zinc-200" onClick={onDetail} type="button">
          <FileText size={17} />
          详情
        </button>
        <Link className="flex h-10 items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-bold text-white" to={`/companion/messages/${order.id}`}>
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
        {['cancelled', 'refunding', 'refunded', 'disputed'].includes(order.status) && (
          <span className="col-span-2 flex h-10 items-center justify-center gap-2 rounded-full bg-zinc-100 text-sm font-bold text-zinc-500">
            <CheckCircle2 size={17} />
            已取消
          </span>
        )}
      </div>
    </article>
  );
}

function OrderDetailSheet({ order, onClose }: { order: AppOrder; onClose: () => void }) {
  const addOnTotal = order.addOns?.reduce((total, item) => total + item.amountCents, 0) ?? 0;
  const basePrice = Math.max(order.amountCents - addOnTotal, 0);
  const creatorDisplayName = order.creatorName || order.creatorId || '预约用户';
  const creatorPhone = order.creatorPhone || '未绑定手机号';

  return (
    <ActionSheet title="订单详情" onClose={onClose}>
      <div className="space-y-3">
        <InfoLine icon={<ReceiptText size={17} />} label="订单号" value={order.orderNo} />
        <InfoLine icon={<FileText size={17} />} label="项目" value={order.activityName ?? order.title} />
        <InfoLine icon={<UserRound size={17} />} label="用户" value={creatorDisplayName} />
        <InfoLine icon={<UserRound size={17} />} label="手机号" value={creatorPhone} />
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

function getWorkEditStatus(record?: OrderWorkRecord): WorkEditTab {
  if (!record) return 'not_started';
  return isOrderWorkConfirmed(record) ? 'done' : 'editing';
}

function getWorkEditTone(status: WorkEditTab) {
  if (status === 'done') return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  if (status === 'editing') return 'bg-blue-50 text-blue-700 ring-blue-100';
  return 'bg-zinc-100 text-zinc-500 ring-zinc-200';
}

function getDisplayOrderStatus(status: OrderStatus): OrderStatus {
  if (status === 'in_service') return 'confirmed';
  if (status === 'refunding' || status === 'refunded' || status === 'disputed') return 'cancelled';
  return status;
}
