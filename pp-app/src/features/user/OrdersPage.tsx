import {
  ArrowLeft,
  CalendarDays,
  Camera,
  ChevronDown,
  CheckCircle2,
  Clock3,
  ImagePlus,
  MapPin,
  MessageCircle,
  ReceiptText,
  Star,
  UploadCloud,
  Users,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { LivePhotoMedia } from '../../components/LivePhotoMedia';
import {
  closeConsultation,
  consultationToOrderInput,
  estimateConsultationQuote,
  listConsultations,
  type ConsultationQuoteEstimate,
  type ConsultationRecord,
} from '../../services/consultationService';
import { listFeedPosts } from '../../services/feedService';
import {
  canEditOrderWork,
  createWatermarkText,
  createOrderWorkRecord,
  getOrderWorkDisplayUrls,
  getOrderWorkPreviewUrls,
  isOrderWorkConfirmed,
  isOriginalReleased,
  listOrderWorkRecords,
  markOrderWorkDisputed,
  saveOrderWorkRecord,
  type OrderWorkRecord,
  type WorkActor,
} from '../../services/orderWorkService';
import { readDomainJson, writeDomainJson } from '../../services/scopedStorage';
import { calculateCancellationSettlement } from '../../services/orderSettlementService';
import type { AppOrder, OrderStatus } from '../../types/domain';
import type { FeedPost } from '../../types/api';
import { formatMoney } from '../../utils/money';

type QuotedConsultation = ConsultationRecord & { quote: NonNullable<ConsultationRecord['quote']> };
type OrderAction =
  | { type: 'cancel'; order: AppOrder }
  | { type: 'review'; order: AppOrder }
  | { type: 'work'; order: AppOrder }
  | null;
type WorkEditTab = 'not_started' | 'editing' | 'done';

const statusTabs: Array<{ key: OrderStatus | 'all'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'paid_pending_confirm', label: '待确认' },
  { key: 'confirmed', label: '已确认' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
];

const workTabs: Array<{ key: WorkEditTab; label: string; desc: string }> = [
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

const reviewStorageKey = 'reviewed-orders-v1';
const workVenueTypeOptions = ['不限', '室外', '室内'];
const workShootTimeOptions = ['不限', '早上', '中午', '下午', '晚上'];
const workActivityCategoryOptions = ['景点游客照', '网红餐厅拍照', '城市街拍', '旅行跟拍', '节日纪念', '情侣/婚纱', '亲子/宠物', '商业形象'];
const workDurationOptions = [
  { label: '30分钟', value: 30 },
  { label: '1小时', value: 60 },
  { label: '1.5小时', value: 90 },
  { label: '2小时', value: 120 },
  { label: '3小时', value: 180 },
  { label: '4小时', value: 240 },
  { label: '8小时', value: 480 },
];

export function OrdersPage() {
  const { orders, session, createOrder, updateOrderFunding, updateOrderStatus } = useAppData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workMode = searchParams.get('work') === '1';
  const backTo = searchParams.get('from') === 'companion' ? '/companion/mine' : '/consumer/mine';
  const [activeStatus, setActiveStatus] = useState<OrderStatus | 'all'>(() => parseOrderStatusTab(searchParams.get('tab')));
  const [activeWorkTab, setActiveWorkTab] = useState<WorkEditTab>('not_started');
  const [activeAction, setActiveAction] = useState<OrderAction>(null);
  const [reviewedOrderIds, setReviewedOrderIds] = useState<string[]>(() => loadReviewedOrderIds());
  const [workRecords, setWorkRecords] = useState<OrderWorkRecord[]>(() => listOrderWorkRecords());
  const [consultationVersion, setConsultationVersion] = useState(0);
  const posts = useMemo(() => listFeedPosts(), []);

  const filteredOrders = useMemo(
    () => orders.filter((order) => activeStatus === 'all' || getDisplayOrderStatus(order.status) === activeStatus),
    [activeStatus, orders],
  );
  const quotedConsultations = useMemo(
    () => (session && !workMode ? listConsultations(session).filter(isQuotedConsultation) : []),
    [consultationVersion, session, workMode],
  );
  const showQuotedConsultations = !workMode && quotedConsultations.length > 0 && (activeStatus === 'all' || activeStatus === 'paid_pending_confirm');
  const workByOrderId = useMemo(() => new Map(workRecords.map((record) => [record.orderId, record])), [workRecords]);
  const completedWorkOrders = useMemo(() => orders.filter((order) => getDisplayOrderStatus(order.status) === 'completed'), [orders]);
  const workCounts = useMemo(() => {
    return workTabs.reduce<Record<WorkEditTab, number>>((next, tab) => {
      next[tab.key] = completedWorkOrders.filter((order) => getWorkEditStatus(workByOrderId.get(order.id)) === tab.key).length;
      return next;
    }, { not_started: 0, editing: 0, done: 0 });
  }, [completedWorkOrders, workByOrderId]);
  const filteredWorkOrders = useMemo(
    () => completedWorkOrders.filter((order) => getWorkEditStatus(workByOrderId.get(order.id)) === activeWorkTab),
    [activeWorkTab, completedWorkOrders, workByOrderId],
  );

  useEffect(() => {
    setActiveStatus(parseOrderStatusTab(searchParams.get('tab')));
  }, [searchParams]);

  function submitReview(orderId: string) {
    const nextIds = Array.from(new Set([...reviewedOrderIds, orderId]));
    setReviewedOrderIds(nextIds);
    writeDomainJson(reviewStorageKey, nextIds);
    setActiveAction(null);
  }

  function submitWorkRecord(record: OrderWorkRecord) {
    setWorkRecords(saveOrderWorkRecord(record));
    setActiveAction(null);
  }

  function acceptConsultationQuote(consultation: ConsultationRecord) {
    const input = consultationToOrderInput(consultation);
    if (!input) return;
    createOrder(input, 'confirmed');
    closeConsultation(consultation.id);
    setConsultationVersion((value) => value + 1);
    setActiveStatus('confirmed');
    navigate('/consumer/orders?tab=confirmed');
  }

  return (
    <div className="min-h-dvh pp-page px-4 py-5">
      <header className="flex items-start gap-3">
        <Link className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/82 text-[#3f302c] ring-1 ring-[#eadfd8]" to={backTo} aria-label="返回我的">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[#e85d75]">我的预约</p>
          <h1 className="mt-1 text-2xl font-bold text-[#3f302c]">{workMode ? '编辑作品' : '订单'}</h1>
        </div>
      </header>

      {workMode ? (
        <section className="mt-4 rounded-[16px] bg-zinc-950 p-4 text-white">
          <p className="text-sm font-black">已完成订单可以提交共同成片</p>
          <p className="mt-1 text-xs leading-5 text-white/58">创作者和摄影师都可编辑，双方确认后可分别选择是否同步到自己的主页。</p>
        </section>
      ) : (
        <section className="mt-4 rounded-[16px] bg-white/78 p-3 text-[#3f302c] ring-1 ring-[#eadfd8]">
          <p className="text-xs font-black text-[#e85d75]">订单分为 4 个主状态</p>
          <p className="mt-1 text-xs leading-5 text-[#8f8078]">
            待确认先沟通，摄影师确认后进入已确认并托管款项；拍摄后创作者确认完成；取消按阶段进入平台违约/退款处理。
          </p>
        </section>
      )}

      <div className="scrollbar-none -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {workMode
          ? workTabs.map((tab) => (
              <button
                key={tab.key}
                className={`h-9 shrink-0 rounded-full px-4 text-sm font-bold ${
                  activeWorkTab === tab.key ? 'bg-[#3f302c] text-white' : 'bg-white/78 text-[#7a6b64] ring-1 ring-[#eadfd8]'
                }`}
                onClick={() => setActiveWorkTab(tab.key)}
                type="button"
              >
                {tab.label}
                <span className="ml-1 text-xs opacity-70">{workCounts[tab.key]}</span>
              </button>
            ))
          : statusTabs.map((tab) => (
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

      {workMode ? <p className="mt-3 text-xs font-semibold leading-5 text-[#8f8078]">{workTabs.find((tab) => tab.key === activeWorkTab)?.desc}</p> : null}

      <div className="mt-4 space-y-4">
        {workMode
          ? filteredWorkOrders.map((order) => (
              <WorkEditOrderCard
                key={order.id}
                order={order}
                record={workByOrderId.get(order.id)}
                onManage={() => setActiveAction({ type: 'work', order })}
              />
            ))
          : null}
        {!workMode && showQuotedConsultations
          ? quotedConsultations.map((consultation) => {
              const companion = posts.find((post) => post.companion.id === consultation.photographerId)?.companion;
              const estimate = estimateConsultationQuote(consultation, companion);
              return (
                <ConsultationQuoteCard
                  key={consultation.id}
                  consultation={consultation}
                  estimate={estimate}
                  onAccept={() => acceptConsultationQuote(consultation)}
                />
              );
            })
          : null}
        {!workMode && filteredOrders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            reviewed={reviewedOrderIds.includes(order.id)}
            workRecord={workByOrderId.get(order.id)}
            onCancel={() => setActiveAction({ type: 'cancel', order })}
            onReview={() => setActiveAction({ type: 'review', order })}
            onManageWork={() => setActiveAction({ type: 'work', order })}
            onPayBalance={() => updateOrderFunding(order.id, { balanceStatus: 'paid', fundsStatus: 'full_escrowed' })}
          />
        ))}
      </div>

      {((workMode && !filteredWorkOrders.length) || (!workMode && !filteredOrders.length && !showQuotedConsultations)) && (
        <div className="mt-16 text-center">
          <ReceiptText className="mx-auto text-zinc-300" size={48} />
          <p className="mt-4 text-sm font-semibold text-[#8f8078]">{workMode ? '当前没有这个编辑状态的作品' : '当前没有这个状态的订单'}</p>
        </div>
      )}

      {activeAction?.type === 'cancel' && (
        <ConfirmCancelDialog
          order={activeAction.order}
          onClose={() => setActiveAction(null)}
          onConfirm={() => {
            updateOrderFunding(activeAction.order.id, calculateCancellationSettlement(activeAction.order, 'creator'));
            updateOrderStatus(activeAction.order.id, 'cancelled');
            setActiveAction(null);
          }}
        />
      )}
      {activeAction?.type === 'review' && (
        <ReviewDialog order={activeAction.order} onClose={() => setActiveAction(null)} onSubmit={() => submitReview(activeAction.order.id)} />
      )}
      {activeAction?.type === 'work' && (
        <OrderWorkDialog
          order={activeAction.order}
          post={posts.find((post) => post.id === activeAction.order.postId)}
          record={workByOrderId.get(activeAction.order.id)}
          onClose={() => setActiveAction(null)}
          onSubmit={submitWorkRecord}
          onDispute={(record, reason) => {
            submitWorkRecord(markOrderWorkDisputed(record, reason));
            updateOrderFunding(activeAction.order.id, { fundsStatus: 'frozen', settlementStatus: 'frozen' });
          }}
        />
      )}
    </div>
  );
}

function OrderCard({
  order,
  reviewed,
  workRecord,
  onCancel,
  onReview,
  onManageWork,
  onPayBalance,
}: {
  order: AppOrder;
  reviewed: boolean;
  workRecord?: OrderWorkRecord;
  onCancel: () => void;
  onReview: () => void;
  onManageWork: () => void;
  onPayBalance: () => void;
}) {
  const addOnTotal = order.addOns?.reduce((total, item) => total + item.amountCents, 0) ?? 0;
  const basePrice = Math.max(order.amountCents - addOnTotal, 0);
  const canCancel = order.status === 'paid_pending_confirm' || order.status === 'confirmed';
  const canReview = order.status === 'completed';
  const needsBalance = order.status === 'confirmed' && order.balanceCents && order.balanceStatus !== 'paid';
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

      {order.status === 'completed' && <ProtectedCompletedWorkPanel record={workRecord} onManage={onManageWork} />}
      {needsBalance ? (
        <section className="mt-4 rounded-[18px] bg-[#fff7df] p-3 text-[#8a5a12] ring-1 ring-[#f2dfaa]">
          <p className="text-sm font-black">尾款待托管</p>
          <p className="mt-1 text-xs leading-5">拍摄前需将尾款 {formatMoney(order.balanceCents ?? 0)} 托管到平台。未托管尾款时，摄影师可拒绝开始拍摄，不交付底片。</p>
          <button className="mt-3 h-10 w-full rounded-full bg-[#3f302c] text-sm font-black text-white" onClick={onPayBalance} type="button">
            支付尾款
          </button>
        </section>
      ) : null}

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
        {['cancelled', 'refunding', 'refunded', 'disputed'].includes(order.status) && (
          <span className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-[#f2e8e1] text-sm font-bold text-[#a99b94]">
            <CheckCircle2 size={17} />
            已取消
          </span>
        )}
      </div>
    </article>
  );
}

function ConsultationQuoteCard({
  consultation,
  estimate,
  onAccept,
}: {
  consultation: QuotedConsultation;
  estimate: ConsultationQuoteEstimate;
  onAccept: () => void;
}) {
  const quote = consultation.quote;
  const adjusted = quote.totalCents !== estimate.totalCents || quote.depositCents !== estimate.depositCents;

  return (
    <article className="rounded-[22px] border border-[#eadfd8] bg-white p-4 shadow-[0_12px_30px_rgba(63,48,44,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#a99b94]">{consultation.id}</p>
          <h2 className="mt-1 truncate text-lg font-bold text-[#3f302c]">{consultation.requestCard.packageName}</h2>
          <p className="mt-1 truncate text-xs font-semibold text-[#8f8078]">{consultation.photographerName} · 咨询报价</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#fff1f3] px-3 py-1 text-xs font-bold text-[#e85d75] ring-1 ring-[#ffdce4]">摄影师已报价</span>
      </div>

      <div className="mt-4 grid gap-3 text-sm">
        <DetailLine icon={<Camera size={17} />} label="摄影师" value={consultation.photographerName} />
        <DetailLine icon={<MapPin size={17} />} label="地点" value={consultation.requestCard.place} />
        <DetailLine icon={<CalendarDays size={17} />} label="时间" value={`${consultation.requestCard.date} ${consultation.requestCard.timeRange}`} />
        <DetailLine icon={<Users size={17} />} label="人数" value={`${consultation.requestCard.peopleCount} 人 · ${consultation.requestCard.sceneType === 'outdoor' ? '室外' : '室内'}`} />
        <DetailLine icon={<ImagePlus size={17} />} label="图片数量" value={formatConsultationImageQuantity(consultation)} />
      </div>

      <div className="mt-4 rounded-[18px] bg-[#fff5f1] p-3 text-sm font-semibold leading-6 text-[#6f625d]">
        <PriceLine label="订单原报价" value={formatMoney(estimate.totalCents)} muted={adjusted} />
        <PriceLine label="摄影师调整价" value={formatMoney(quote.totalCents)} strong />
        <PriceLine label="定金托管" value={formatMoney(quote.depositCents)} />
        <PriceLine label="拍摄前尾款" value={formatMoney(quote.balanceCents)} />
        {adjusted ? <p className="mt-2 text-xs text-[#a99b94]">摄影师已基于需求卡调整价格，请确认后支付定金。</p> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          to={`/consumer/messages/${consultation.id}`}
          className="flex h-10 items-center justify-center gap-2 rounded-full bg-[#f2e8e1] text-sm font-bold text-[#6f625d]"
        >
          <MessageCircle size={17} />
          进入沟通
        </Link>
        <button
          className="flex h-10 items-center justify-center gap-2 rounded-full bg-[#3f302c] text-sm font-bold text-white disabled:bg-zinc-200 disabled:text-zinc-400"
          onClick={onAccept}
          type="button"
        >
          <CheckCircle2 size={17} />
          确认并付定金
        </button>
      </div>
    </article>
  );
}

function isQuotedConsultation(consultation: ConsultationRecord): consultation is QuotedConsultation {
  return consultation.status === 'quoted' && Boolean(consultation.quote);
}

function formatConsultationImageQuantity(consultation: ConsultationRecord) {
  const { imageQuantityMode, customImageQuantity } = consultation.requestCard;
  if (imageQuantityMode === 'unlimited') return '数量不限';
  if (imageQuantityMode === 'custom') return `${customImageQuantity ?? 12} 张`;
  return `${imageQuantityMode ?? '9'} 张`;
}

function parseOrderStatusTab(tab: string | null): OrderStatus | 'all' {
  if (!tab) return 'all';
  return statusTabs.some((item) => item.key === tab) ? (tab as OrderStatus | 'all') : 'all';
}

function WorkEditOrderCard({ order, record, onManage }: { order: AppOrder; record?: OrderWorkRecord; onManage: () => void }) {
  const status = getWorkEditStatus(record);
  const statusLabel = workTabs.find((tab) => tab.key === status)?.label ?? '未编辑';
  const actionText = status === 'not_started' ? '开始编辑' : status === 'editing' ? '继续编辑' : '查看成片';
  const imageCount = record?.imageUrls.length ?? 0;
  const imageLimit = getOrderImageLimit(order);
  const imageLimitText = imageLimit.limit === null ? '不限' : String(imageLimit.limit);

  return (
    <article className="rounded-[22px] pp-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#a99b94]">{order.orderNo}</p>
          <h2 className="mt-1 truncate text-lg font-bold text-[#3f302c]">{order.activityName ?? order.title}</h2>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ${getWorkEditTone(status)}`}>{statusLabel}</span>
      </div>

      <div className="mt-4 grid gap-3 text-sm">
        <DetailLine icon={<Camera size={17} />} label="项目" value={order.activityName ?? order.title} />
        <DetailLine icon={<MapPin size={17} />} label="地点" value={order.place} />
        <DetailLine icon={<CalendarDays size={17} />} label="时间" value={`${order.dateLabel ?? ''} ${order.timeLabel ?? order.time}`.trim()} />
        <DetailLine icon={<Clock3 size={17} />} label="时长" value={order.durationLabel ?? `${order.durationMinutes ?? 0}分钟`} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-[18px] bg-[#fff5f1] p-3 text-center">
        <WorkMetric label="照片/Live" value={`${imageCount}/${imageLimitText}`} />
        <WorkMetric label="创作者确认" value={record?.creatorConfirmed ? '已确认' : '未确认'} />
        <WorkMetric label="摄影师确认" value={record?.photographerConfirmed ? '已确认' : '未确认'} />
      </div>

      <button className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#3f302c] text-sm font-bold text-white" onClick={onManage} type="button">
        <ImagePlus size={17} />
        {actionText}
      </button>
    </article>
  );
}

function WorkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[#a99b94]">{label}</p>
      <p className="mt-1 text-xs font-black text-[#3f302c]">{value}</p>
    </div>
  );
}

function ProtectedCompletedWorkPanel({ record, onManage }: { record?: OrderWorkRecord; onManage: () => void }) {
  const confirmed = record ? isOrderWorkConfirmed(record) : false;
  const originalReleased = record ? isOriginalReleased(record) : false;
  const displayUrls = record ? getOrderWorkDisplayUrls(record) : [];
  const statusText = !record
    ? '还未上传成片'
    : record.deliveryStatus === 'disputed'
      ? '预览争议处理中'
      : record.changeRequestBy && !record.changeAccepted
        ? '修改待另一方确认'
        : confirmed
          ? '双方已确认'
          : '等待双方确认';
  const publishText =
    confirmed && (record?.publishToCreator || record?.publishToPhotographer)
      ? [record.publishToCreator ? '创作者主页' : '', record.publishToPhotographer ? '摄影师主页' : ''].filter(Boolean).join(' / ')
      : '确认后可选择同步主页';

  return (
    <section className="mt-4 rounded-[18px] bg-zinc-950 p-3 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-xs font-black text-white/46">
            <Users size={14} />
            成片协作
          </p>
          <h3 className="mt-1 text-sm font-black">{statusText}</h3>
          <p className="mt-1 truncate text-xs font-semibold text-white/48">{publishText}</p>
        </div>
        <button className="h-9 shrink-0 rounded-full bg-white px-3 text-xs font-black text-zinc-950" onClick={onManage} type="button">
          {record ? '管理成片' : '上传照片'}
        </button>
      </div>

      {record ? (
        <p className="mt-3 rounded-[10px] bg-white/8 px-3 py-2 text-[11px] font-semibold leading-5 text-white/58">
          {originalReleased ? '双方确认后已开放原图/无水印图。' : '当前仅展示低清/动态水印预览，原图会在确认完成或平台裁定后开放。'}
        </p>
      ) : null}

      {displayUrls.length ? (
        <div className="mt-3 grid grid-cols-4 gap-1">
          {displayUrls.slice(0, 4).map((url, index) => (
            <WatermarkedMedia
              key={`${url}-${index}`}
              url={url}
              index={index}
              active={!originalReleased}
              watermarkText={record?.watermarkText ?? 'PP preview'}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CompletedWorkPanel({ record, onManage }: { record?: OrderWorkRecord; onManage: () => void }) {
  const confirmed = record ? isOrderWorkConfirmed(record) : false;
  const statusText = !record
    ? '还未上传成片'
    : record.changeRequestBy && !record.changeAccepted
      ? '修改待另一方确认'
      : confirmed
        ? '双方已确认'
        : '等待双方确认';
  const publishText =
    confirmed && (record?.publishToCreator || record?.publishToPhotographer)
      ? [record.publishToCreator ? '创作者主页' : '', record.publishToPhotographer ? '摄影师主页' : ''].filter(Boolean).join(' / ')
      : '确认后可选择同步主页';

  return (
    <section className="mt-4 rounded-[18px] bg-zinc-950 p-3 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-xs font-black text-white/46">
            <Users size={14} />
            成片协作
          </p>
          <h3 className="mt-1 text-sm font-black">{statusText}</h3>
          <p className="mt-1 truncate text-xs font-semibold text-white/48">{publishText}</p>
        </div>
        <button className="h-9 shrink-0 rounded-full bg-white px-3 text-xs font-black text-zinc-950" onClick={onManage} type="button">
          {record ? '管理成片' : '上传照片'}
        </button>
      </div>

      {record?.imageUrls.length ? (
        <div className="mt-3 grid grid-cols-4 gap-1">
          {record.imageUrls.slice(0, 4).map((url, index) => (
            <div key={`${url}-${index}`} className="aspect-square w-full overflow-hidden rounded-[6px]">
              <LivePhotoMedia media={mediaFromWorkUrl(url, index)} alt={`成片 ${index + 1}`} />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function OrderWorkDialog({
  order,
  post,
  record,
  onClose,
  onSubmit,
  onDispute,
}: {
  order: AppOrder;
  post?: FeedPost;
  record?: OrderWorkRecord;
  onClose: () => void;
  onSubmit: (record: OrderWorkRecord) => void;
  onDispute: (record: OrderWorkRecord, reason: string) => void;
}) {
  const [draft, setDraft] = useState<OrderWorkRecord>(() => record ?? createOrderWorkRecord(order, post));
  const [disputeReason, setDisputeReason] = useState('');
  const confirmed = isOrderWorkConfirmed(draft);
  const editable = canEditOrderWork(draft);
  const modificationPending = Boolean(draft.changeRequestBy && !draft.changeAccepted);
  const originalReleased = isOriginalReleased(draft);
  const previewUrls = getOrderWorkPreviewUrls(draft);
  const imageLimit = getOrderImageLimit(order);
  const imageLimitText = imageLimit.limit === null ? '不限' : String(imageLimit.limit);

  function updateEditableDraft(patch: Partial<OrderWorkRecord>) {
    setDraft((current) => ({
      ...current,
      ...patch,
      creatorConfirmed: false,
      photographerConfirmed: false,
      publishToCreator: false,
      publishToPhotographer: false,
      changeRequestBy: undefined,
      changeAccepted: true,
    }));
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const selectedFiles = Array.from(files).filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
    const limitedFiles = imageLimit.limit === null ? selectedFiles : selectedFiles.slice(0, imageLimit.limit);
    const imageUrls = await readFilesAsDataUrls(limitedFiles);
    updateEditableDraft({
      imageUrls,
      originalUrls: imageUrls,
      previewUrls: imageUrls,
      watermarkText: createWatermarkText(order),
      previewMode: 'low_res_watermarked',
      deliveryStatus: 'preview_ready',
      disputeReason: undefined,
    });
  }

  function confirm(actor: WorkActor) {
    setDraft((current) => ({
      ...current,
      creatorConfirmed: actor === 'creator' ? !current.creatorConfirmed : current.creatorConfirmed,
      photographerConfirmed: actor === 'photographer' ? !current.photographerConfirmed : current.photographerConfirmed,
      changeRequestBy: undefined,
      changeAccepted: true,
    }));
  }

  function requestChange(actor: WorkActor) {
    setDraft((current) => ({
      ...current,
      changeRequestBy: actor,
      changeAccepted: false,
    }));
  }

  function acceptChange() {
    setDraft((current) => ({
      ...current,
      creatorConfirmed: false,
      photographerConfirmed: false,
      publishToCreator: false,
      publishToPhotographer: false,
      changeAccepted: true,
    }));
  }

  function submit() {
    const nextConfirmed = draft.creatorConfirmed && draft.photographerConfirmed;
    onSubmit({
      ...draft,
      previewMode: nextConfirmed ? 'original_released' : draft.previewMode ?? 'low_res_watermarked',
      deliveryStatus: nextConfirmed ? 'confirmed' : draft.deliveryStatus ?? (draft.imageUrls.length ? 'preview_ready' : 'draft'),
      publishToCreator: nextConfirmed ? draft.publishToCreator : false,
      publishToPhotographer: nextConfirmed ? draft.publishToPhotographer : false,
      updatedAt: new Date().toISOString(),
    });
  }

  function dispute() {
    onDispute(draft, disputeReason);
  }

  return (
    <ActionSheet title="成片协作发布" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-[14px] bg-zinc-950 p-3 text-white">
          <p className="text-xs font-bold text-white/48">{order.orderNo}</p>
          <h3 className="mt-1 text-base font-black">{order.title}</h3>
          <p className="mt-1 text-xs font-semibold text-white/54">{order.companion} · {order.place}</p>
        </div>

        <div className="space-y-3 rounded-[14px] bg-white p-3 ring-1 ring-zinc-100">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black text-zinc-400">上传照片/Live</p>
              <p className="mt-1 text-[11px] font-semibold leading-5 text-zinc-400">
                {imageLimit.limit === null ? '需求卡为数量不限，上传后生成低清/水印预览。' : `需求卡要求最多 ${imageLimit.limit} 张，超出会只保留前 ${imageLimit.limit} 张。`}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-black text-zinc-400">{draft.imageUrls.length}/{imageLimitText}</span>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {previewUrls.map((url, index) => (
              <div key={`${url}-${index}`} className="relative aspect-square w-full overflow-hidden rounded-[8px]">
                <LivePhotoMedia media={mediaFromWorkUrl(url, index)} alt={`成片 ${index + 1}`} />
                {!originalReleased ? (
                  <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10 px-1 text-center text-[9px] font-black uppercase tracking-[0.16em] text-white/70">
                    {draft.watermarkText ?? 'PP preview'}
                  </span>
                ) : null}
              </div>
            ))}
            {!previewUrls.length ? (
              <div className="col-span-3 grid min-h-28 place-items-center rounded-[10px] bg-zinc-100 px-4 text-center text-sm font-bold text-zinc-400">
                <span className="grid place-items-center gap-2">
                  <ImagePlus size={24} />
                  暂无照片，先上传照片/Live 后双方再确认发布
                </span>
              </div>
            ) : null}
          </div>

          <label className={`flex h-11 items-center justify-center gap-2 rounded-full text-sm font-black ${editable ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-400'}`}>
            <UploadCloud size={17} />
            选择上传照片/Live
            <input className="hidden" type="file" accept="image/*,video/*" multiple disabled={!editable} onChange={(event) => void handleFiles(event.target.files)} />
          </label>
        </div>

        <div className="rounded-[12px] bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
          摄影师上传原图后，平台先给创作者展示低清/动态水印预览。原图/无水印图只在双方确认完成或管理员裁定后开放；发起争议会冻结托管款。
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-black text-zinc-400">作品标题</span>
            <input
              className="mt-1 h-11 w-full rounded-[10px] bg-zinc-100 px-3 text-sm font-bold outline-none disabled:text-zinc-400"
              disabled={!editable}
              value={draft.title}
              onChange={(event) => updateEditableDraft({ title: event.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-xs font-black text-zinc-400">作品文案</span>
            <textarea
              className="mt-1 min-h-24 w-full resize-none rounded-[10px] bg-zinc-100 p-3 text-sm leading-6 outline-none disabled:text-zinc-400"
              disabled={!editable}
              value={draft.caption}
              onChange={(event) => updateEditableDraft({ caption: event.target.value })}
            />
          </label>
        </div>

        <div className="space-y-3 rounded-[14px] bg-white p-3 ring-1 ring-zinc-100">
          <div>
            <p className="text-xs font-black text-zinc-400">筛选匹配信息</p>
            <p className="mt-1 text-[11px] font-semibold leading-5 text-zinc-400">这些字段会写入作品信息，决定作品能否被发现页筛选命中。</p>
          </div>
          <WorkOptionGroup
            label="拍摄环境"
            options={workVenueTypeOptions}
            value={draft.venueType}
            disabled={!editable}
            onChange={(venueType) => updateEditableDraft({ venueType })}
          />
          <WorkOptionGroup
            label="拍摄时间"
            options={workShootTimeOptions}
            value={draft.shootTime}
            disabled={!editable}
            onChange={(shootTime) => updateEditableDraft({ shootTime })}
          />
          <WorkSelectField
            label="活动类型"
            options={workActivityCategoryOptions}
            value={draft.activityCategory}
            disabled={!editable}
            onChange={(activityCategory) => updateEditableDraft({ activityCategory })}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-black text-zinc-400">拍摄时长</span>
              <select
                className="mt-1 h-11 w-full rounded-[10px] bg-zinc-100 px-3 text-sm font-bold outline-none disabled:text-zinc-400"
                disabled={!editable}
                value={draft.durationMinutes}
                onChange={(event) => updateEditableDraft({ durationMinutes: Number(event.target.value) })}
              >
                {workDurationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-black text-zinc-400">预算/成交价</span>
              <input
                className="mt-1 h-11 w-full rounded-[10px] bg-zinc-100 px-3 text-sm font-bold outline-none disabled:text-zinc-400"
                disabled={!editable}
                min={0}
                step={10}
                type="number"
                value={Math.round(draft.budgetCents / 100)}
                onChange={(event) => updateEditableDraft({ budgetCents: Math.max(0, Number(event.target.value) || 0) * 100 })}
              />
            </label>
          </div>
        </div>

        {modificationPending ? (
          <div className="rounded-[12px] bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-800">
            {draft.changeRequestBy === 'creator' ? '创作者' : '摄影师'}已发起修改，需另一方确认后才能重新编辑。
            <button className="mt-3 h-10 w-full rounded-full bg-amber-900 text-sm font-black text-white" onClick={acceptChange} type="button">
              另一方确认修改
            </button>
          </div>
        ) : null}

        {!editable && confirmed ? (
          <div className="grid grid-cols-2 gap-2">
            <button className="h-10 rounded-full bg-zinc-100 text-xs font-black text-zinc-700" onClick={() => requestChange('creator')} type="button">
              创作者发起修改
            </button>
            <button className="h-10 rounded-full bg-zinc-100 text-xs font-black text-zinc-700" onClick={() => requestChange('photographer')} type="button">
              摄影师发起修改
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button
            className={`h-11 rounded-full text-sm font-black ${draft.creatorConfirmed ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-700'}`}
            onClick={() => confirm('creator')}
            type="button"
            disabled={modificationPending}
          >
            创作者确认
          </button>
          <button
            className={`h-11 rounded-full text-sm font-black ${draft.photographerConfirmed ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-700'}`}
            onClick={() => confirm('photographer')}
            type="button"
            disabled={modificationPending}
          >
            摄影师确认
          </button>
        </div>

        <div className="rounded-[12px] bg-zinc-100 p-3">
          <p className="text-xs font-black text-zinc-400">双方确认后选择同步主页</p>
          <div className="mt-3 grid gap-2">
            <PublishToggle
              label="同步到创作者主页"
              checked={confirmed && draft.publishToCreator}
              disabled={!confirmed}
              onChange={(checked) => setDraft((current) => ({ ...current, publishToCreator: checked }))}
            />
            <PublishToggle
              label="同步到摄影师主页"
              checked={confirmed && draft.publishToPhotographer}
              disabled={!confirmed}
              onChange={(checked) => setDraft((current) => ({ ...current, publishToPhotographer: checked }))}
            />
          </div>
        </div>

        {!originalReleased ? (
          <div className="rounded-[12px] bg-rose-50 p-3">
            <label className="block">
              <span className="text-xs font-black text-rose-500">争议说明</span>
              <textarea
                className="mt-1 min-h-20 w-full resize-none rounded-[10px] bg-white p-3 text-sm leading-6 outline-none"
                value={disputeReason}
                onChange={(event) => setDisputeReason(event.target.value)}
                placeholder="例如：成片与报价沟通不符、缺少原定场景、质量需要管理员介入。"
              />
            </label>
            <button className="mt-3 h-10 w-full rounded-full bg-rose-600 text-sm font-black text-white" onClick={dispute} type="button">
              发起争议并冻结托管款
            </button>
          </div>
        ) : null}

        <button className="h-11 w-full rounded-full bg-zinc-950 text-sm font-black text-white" onClick={submit} type="button">
          保存协作状态
        </button>
      </div>
    </ActionSheet>
  );
}

function WorkOptionGroup({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-black text-zinc-400">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            className={`h-9 rounded-full px-3 text-xs font-black ring-1 transition ${
              value === option ? 'bg-zinc-950 text-white ring-zinc-950' : 'bg-zinc-50 text-zinc-500 ring-zinc-200'
            } ${disabled ? 'opacity-50' : ''}`}
            disabled={disabled}
            onClick={() => onChange(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkSelectField({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black text-zinc-400">{label}</span>
      <span className="relative mt-1 block">
        <select
          className="h-11 w-full appearance-none rounded-[10px] bg-zinc-100 px-3 pr-10 text-sm font-bold outline-none disabled:text-zinc-400"
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" size={17} />
      </span>
    </label>
  );
}

function PublishToggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`flex items-center justify-between gap-3 rounded-[10px] bg-white px-3 py-3 text-sm font-bold ${disabled ? 'text-zinc-400' : 'text-zinc-900'}`}>
      <span>{label}</span>
      <input type="checkbox" className="h-5 w-5 accent-zinc-950" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function ConfirmCancelDialog({ order, onClose, onConfirm }: { order: AppOrder; onClose: () => void; onConfirm: () => void }) {
  const isConfirmed = order.status === 'confirmed' || order.status === 'in_service';
  return (
    <ActionSheet title="取消订单" onClose={onClose}>
      <p className="text-sm leading-6 text-zinc-500">
        确认取消 {order.companion} 的「{order.activityName ?? order.title}」订单吗？
        {isConfirmed
          ? '已确认订单取消会进入违约处理：创作者从托管款中扣除违约金，平台抽点后赔付给摄影师。'
          : '待确认订单可取消，摄影师未接单前不产生违约金。'}
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

function ActionSheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#3f302c]/30 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 sm:pb-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-[22px] bg-[#fffaf6] shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#eadfd8] bg-[#fffaf6]/95 px-4 py-3 backdrop-blur">
          <h2 className="text-lg font-bold text-[#3f302c]">{title}</h2>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-[#f2e8e1] text-[#7a6b64]" onClick={onClose} type="button" aria-label="关闭">
            <XCircle size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-4 pt-4">{children}</div>
      </div>
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

function readFilesAsDataUrls(files: File[]) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }),
    ),
  );
}

function WatermarkedMedia({
  url,
  index,
  active,
  watermarkText,
  roundedClassName = 'rounded-[6px]',
}: {
  url: string;
  index: number;
  active: boolean;
  watermarkText: string;
  roundedClassName?: string;
}) {
  return (
    <div className={`relative aspect-square w-full overflow-hidden ${roundedClassName}`}>
      <LivePhotoMedia media={mediaFromWorkUrl(url, index)} alt={`成片 ${index + 1}`} />
      {active ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10 px-1 text-center text-[9px] font-black uppercase tracking-[0.16em] text-white/70">
          {watermarkText}
        </div>
      ) : null}
    </div>
  );
}

function mediaFromWorkUrl(url: string, index: number) {
  const contentType = parseDataUrlContentType(url);
  const isVideo = contentType.startsWith('video/');
  return {
    id: `order-work-preview-${index + 1}`,
    url,
    mediaKind: isVideo ? 'live' : 'image',
    videoUrl: isVideo ? url : undefined,
    contentType,
    sortOrder: index + 1,
  };
}

function parseDataUrlContentType(url: string) {
  const match = url.match(/^data:([^;,]+)/);
  return match?.[1] ?? '';
}

export function getOrderImageLimit(order: Pick<AppOrder, 'imageQuantityMode' | 'customImageQuantity'>) {
  const mode = order.imageQuantityMode ?? '9';
  if (mode === 'unlimited') return { limit: null as number | null, label: '不限' };
  if (mode === 'custom') {
    const customLimit = Math.max(1, Math.floor(order.customImageQuantity ?? 9));
    return { limit: customLimit, label: `${customLimit}张` };
  }
  const limit = Number(mode);
  return { limit, label: `${limit}张` };
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

function loadReviewedOrderIds() {
  return readDomainJson<string[]>(reviewStorageKey, []);
}
