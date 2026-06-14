import { AlertTriangle, Camera, ChevronLeft, Flag, LockKeyhole, Pin, Search, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState, type PointerEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { closeConsultation, consultationToOrderInput, getConsultation, getConsultationRiskText, listConsultations, sendQuoteForConsultation, type ConsultationRecord } from '../../services/consultationService';
import { listTestAccounts } from '../../services/accountDirectory';
import { listFeedPosts } from '../../services/feedService';
import { evaluateMessageRisk, fetchConversation, getConversation, getConversationForOrder, saveLocalConversation, sendMessage, submitOrderReport } from '../../services/messageService';
import { readDomainJson, writeDomainJson } from '../../services/scopedStorage';
import type { AppOrder, Conversation, FeedPost } from '../../types/api';
import { formatMoney } from '../../utils/money';

type ThreadPrefs = {
  pinnedIds: string[];
  unreadIds: string[];
  hiddenIds: string[];
  deletedIds: string[];
};

type SwipeState = {
  id: string;
  startX: number;
  deltaX: number;
} | null;

const emptyPrefs: ThreadPrefs = { pinnedIds: [], unreadIds: [], hiddenIds: [], deletedIds: [] };
const threadPrefsKey = 'message-thread-prefs-v1';

export function MessagesPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { orders, session, createOrder } = useAppData();
  const [consultationVersion, setConsultationVersion] = useState(0);
  const [threadPrefs, setThreadPrefs] = useState<ThreadPrefs>(() => loadThreadPrefs());
  const activeOrder = useMemo(() => (orderId ? orders.find((order) => order.id === orderId) : undefined), [orderId, orders]);
  const activeConsultation = useMemo(() => (!activeOrder && orderId ? getConsultation(orderId) : null), [activeOrder, consultationVersion, orderId]);
  const activePost = useMemo(() => findPostForOrder(activeOrder, listFeedPosts()), [activeOrder]);
  const [draft, setDraft] = useState('');
  const [conversation, setConversation] = useState<Conversation>(() => getConversation());
  const [allowMediumRisk, setAllowMediumRisk] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [sendBlocked, setSendBlocked] = useState(false);
  const risk = useMemo(() => evaluateMessageRisk(draft), [draft]);
  const isMediumRiskWaiting = risk.level === 'medium' && !allowMediumRisk;
  const messagesBasePath = session?.role === 'companion' ? '/companion/messages' : '/consumer/messages';
  const otherProfile = activeOrder ? getOtherParticipant(activeOrder, activePost, session?.role) : activeConsultation ? getOtherParticipantForConsultation(activeConsultation, session?.role) : null;
  const otherProfileUrl = otherProfile?.profileUrl ?? '/consumer/companions';
  const activeThreadId = otherProfile ? getParticipantThreadId(otherProfile.profileUrl, otherProfile.name) : activeOrder ? getThreadId(activeOrder.id) : activeConsultation ? getThreadId(activeConsultation.id) : '';
  const pinned = activeThreadId ? threadPrefs.pinnedIds.includes(activeThreadId) : false;

  useEffect(() => {
    saveThreadPrefs(threadPrefs);
  }, [threadPrefs]);

  useEffect(() => {
    if (!activeOrder && !activeConsultation) return () => undefined;
    if (activeConsultation) {
      setConversation(createConversationFromConsultation(activeConsultation));
      return () => undefined;
    }
    if (!activeOrder) return () => undefined;
    const order = activeOrder;
    let mounted = true;
    fetchConversation(order.id).then((nextConversation) => {
      if (mounted) {
        setConversation({
          ...nextConversation,
          id: nextConversation.id || `local-conversation-${order.id}`,
          orderId: order.id,
          orderNo: order.orderNo,
        });
      }
    });

    return () => {
      mounted = false;
    };
  }, [activeConsultation, activeOrder]);

  function updatePrefs(updater: (current: ThreadPrefs) => ThreadPrefs) {
    setThreadPrefs((current) => normalizeThreadPrefs(updater(current)));
  }

  async function handleSend() {
    const content = draft.trim();
    if (!content) return;

    if (risk.shouldBlock) {
      void sendMessage(conversation.id, content, getMessageSender(session?.role));
      setSendBlocked(true);
      return;
    }

    if (isMediumRiskWaiting) {
      setAllowMediumRisk(true);
      return;
    }

    const result = await sendMessage(conversation.id, content, getMessageSender(session?.role));
    if (result.blocked || !result.message) {
      setSendBlocked(true);
      return;
    }

    setConversation((current) => {
      const nextConversation = {
        ...current,
        messages: [...current.messages, result.message!],
      };
      saveLocalConversation(nextConversation);
      return nextConversation;
    });
    setDraft('');
    setAllowMediumRisk(false);
    setSendBlocked(false);
  }

  if (!orderId) {
    return <MessageThreadList orders={orders} consultations={listConsultations(session)} prefs={threadPrefs} sessionRole={session?.role} basePath={messagesBasePath} onUpdatePrefs={updatePrefs} />;
  }

  if (!activeOrder && !activeConsultation) {
    return (
      <div className="grid min-h-dvh place-items-center pp-page px-6 text-center">
        <div>
          <p className="text-base font-bold text-zinc-900">没有找到这条会话</p>
          <Link className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-black px-5 text-sm font-bold text-white" to={messagesBasePath}>
            返回消息
          </Link>
        </div>
      </div>
    );
  }

  const riskKeywords = risk.hits.map((hit) => hit.keyword).join('、');
  const activeTitle = activeOrder?.title ?? activeConsultation?.requestCard.packageName ?? '咨询报价';
  const activeSubtitle = activeOrder
    ? `${activeOrder.companion} · ${activeOrder.dateLabel ?? activeOrder.time} ${activeOrder.timeLabel ?? ''}`
    : activeConsultation
      ? `${activeConsultation.photographerName} · ${activeConsultation.requestCard.date} ${activeConsultation.requestCard.timeRange}`
      : '';
  const activeAmount = activeOrder ? activeOrder.amountCents : activeConsultation?.quote?.totalCents;
  const activeStatusText = activeOrder?.statusText ?? (activeConsultation?.status === 'quoted' ? '已报价' : activeConsultation?.status === 'closed' ? '已关闭' : '咨询中');

  return (
    <div className="flex min-h-dvh flex-col pp-page">
      <header className="border-b border-[#eadfd8] bg-[#fbf7f2]/92 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Link className="grid h-9 w-9 place-items-center rounded-full bg-white/78 text-[#3f302c] ring-1 ring-[#eadfd8]" to={messagesBasePath} aria-label="返回消息">
            <ChevronLeft size={20} />
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-base font-bold text-[#3f302c]">{activeConsultation ? '咨询沟通' : '订单沟通'}</h1>
            <p className="mt-0.5 truncate text-xs text-[#8f8078]">{conversation.orderNo}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className={`grid h-9 w-9 place-items-center rounded-full ${
                pinned ? 'bg-[#3f302c] text-white' : 'bg-white/78 text-[#3f302c] ring-1 ring-[#eadfd8]'
              }`}
              aria-label={pinned ? '取消置顶' : '置顶聊天'}
              onClick={() => {
                updatePrefs((current) => ({
                  ...current,
                  pinnedIds: toggleId(current.pinnedIds, activeThreadId),
                }));
              }}
              type="button"
            >
              <Pin size={17} fill={pinned ? 'currentColor' : 'none'} />
            </button>
            <button
              className={`grid h-9 w-9 place-items-center rounded-full ${reportSent ? 'bg-[#fff1f2] text-[#e85d75]' : 'bg-white/78 text-[#3f302c] ring-1 ring-[#eadfd8]'}`}
              aria-label="举报"
              onClick={() => {
                setReportSent(true);
                if (activeOrder) void submitOrderReport(activeOrder.id);
              }}
              type="button"
            >
              <Flag size={18} />
            </button>
          </div>
        </div>
        {reportSent && <p className="mt-2 text-center text-xs font-semibold text-rose-500">举报已记录，平台会优先复核这笔订单沟通。</p>}
      </header>

      <section className="border-b border-[#eadfd8] bg-white/72 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#a99b94]">{activeOrder?.orderNo ?? activeConsultation?.id}</p>
            <h2 className="mt-1 truncate text-lg font-bold text-[#3f302c]">{activeTitle}</h2>
            <p className="mt-1 truncate text-xs text-[#8f8078]">
              {activeSubtitle}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold text-[#3f302c]">{activeAmount ? formatMoney(activeAmount) : '待报价'}</p>
            <p className="mt-1 text-xs text-[#a99b94]">{activeStatusText}</p>
          </div>
        </div>
        {activeConsultation ? (
          <ConsultationActionPanel
            consultation={activeConsultation}
            sessionRole={session?.role}
            onQuote={() => {
              const post = listFeedPosts().find((item) => item.companion.id === activeConsultation.photographerId);
              const next = sendQuoteForConsultation(activeConsultation.id, post?.companion);
              setConsultationVersion((value) => value + 1);
              if (next) setConversation(createConversationFromConsultation(next));
            }}
            onAccept={() => {
              const input = consultationToOrderInput(activeConsultation);
              if (!input) return;
              const order = createOrder(input);
              closeConsultation(activeConsultation.id);
              navigate(`/consumer/messages/${order.id}`);
            }}
          />
        ) : null}
      </section>

      <section className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <div className="flex gap-2 rounded-[18px] bg-[#fff7df] p-3 text-xs leading-5 text-[#8a5a12] ring-1 ring-[#f2dfaa]">
          <ShieldCheck className="mt-0.5 shrink-0" size={16} />
          <span>请只围绕本订单沟通时间、地点、拍摄需求和服务确认。不要交换联系方式，不要私下转账或绕开平台付款。</span>
        </div>

        {conversation.messages.map((message) => {
          const mine = message.from === getMessageSender(session?.role);
          return (
            <div key={message.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
              {!mine ? (
                <Link to={otherProfileUrl} className="shrink-0" aria-label={`查看${otherProfile?.name ?? activeOrder?.companion ?? '对方'}主页`}>
                  {otherProfile?.avatar ? (
                    <img className="h-8 w-8 rounded-full object-cover ring-1 ring-[#eadfd8]" src={otherProfile.avatar} alt={otherProfile.name} />
                  ) : (
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-white ring-1 ring-[#eadfd8]">
                      <Camera size={15} />
                    </div>
                  )}
                </Link>
              ) : null}
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                  mine ? 'bg-[#3f302c] text-white' : 'bg-white/86 text-[#3f302c] ring-1 ring-[#eadfd8]'
                }`}
              >
                <p>{message.text}</p>
                {message.riskStatus === 'flagged' && <p className="mt-1 text-[11px] text-amber-500">已提示风险</p>}
              </div>
            </div>
          );
        })}
      </section>

      <footer className="sticky bottom-0 border-t border-[#eadfd8] bg-[#fffaf6]/96 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        {risk.level === 'high' && (
          <RiskNotice tone="high" text={`检测到高风险内容：${riskKeywords || '联系方式或私下交易'}。为保障双方权益，此消息不能发送。`} />
        )}
        {sendBlocked && risk.level === 'high' && <RiskNotice tone="high" text="发送已被阻止。请删除联系方式、转账或绕平台交易相关内容后再试。" />}
        {risk.level === 'medium' && (
          <RiskNotice
            tone="medium"
            text={
              allowMediumRisk
                ? '你已确认继续发送。请确保内容仍围绕订单，不包含联系方式或私下交易。'
                : `检测到中风险表达：${riskKeywords || '交易或联系方式相关表达'}。再次点击发送将继续发送并标记。`
            }
          />
        )}

        <div className="flex items-end gap-2">
          <textarea
            className="max-h-28 min-h-11 flex-1 resize-none rounded-[18px] bg-white/82 px-4 py-3 text-sm leading-5 text-[#3f302c] outline-none ring-1 ring-[#eadfd8] placeholder:text-[#b0a29b] focus:ring-2 focus:ring-[#e8c5cb]"
            placeholder="输入订单相关需求，例如集合点、拍摄风格、时间确认"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setAllowMediumRisk(false);
              setSendBlocked(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
          />
          <button
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-white ${
              risk.shouldBlock ? 'bg-[#d8d0cb]' : isMediumRiskWaiting ? 'bg-amber-500' : 'bg-[#e85d75]'
            }`}
            onClick={handleSend}
            type="button"
            aria-label="发送消息"
          >
            {risk.shouldBlock ? <LockKeyhole size={18} /> : <Send size={18} />}
          </button>
        </div>
      </footer>
    </div>
  );
}

function MessageThreadList({
  orders,
  consultations,
  prefs,
  sessionRole,
  basePath,
  onUpdatePrefs,
}: {
  orders: ReturnType<typeof useAppData>['orders'];
  consultations: ConsultationRecord[];
  prefs: ThreadPrefs;
  sessionRole?: string;
  basePath: string;
  onUpdatePrefs: (updater: (current: ThreadPrefs) => ThreadPrefs) => void;
}) {
  const posts = useMemo(() => listFeedPosts(), []);
  const [openActionThreadId, setOpenActionThreadId] = useState<string | null>(null);
  const [swipe, setSwipe] = useState<SwipeState>(null);
  const sortedOrders = useMemo(
    () => [...orders].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [orders],
  );
  const threads = useMemo(
    () => groupThreadsByParticipant([...buildConsultationThreads(consultations, sessionRole), ...buildMessageThreads(sortedOrders, posts, sessionRole)]),
    [consultations, posts, sessionRole, sortedOrders],
  );
  const visibleThreads = useMemo(
    () =>
      threads
        .filter((thread) => !prefs.hiddenIds.includes(thread.id) && !prefs.deletedIds.includes(thread.id))
        .sort((left, right) => Number(prefs.pinnedIds.includes(right.id)) - Number(prefs.pinnedIds.includes(left.id))),
    [prefs.deletedIds, prefs.hiddenIds, prefs.pinnedIds, threads],
  );

  function applyThreadAction(threadId: string, action: 'unread' | 'hide' | 'delete') {
    onUpdatePrefs((current) => {
      if (action === 'unread') return { ...current, unreadIds: addId(current.unreadIds, threadId) };
      if (action === 'hide') return { ...current, hiddenIds: addId(current.hiddenIds, threadId) };
      return { ...current, deletedIds: addId(current.deletedIds, threadId) };
    });
    setOpenActionThreadId(null);
  }

  function handlePointerDown(threadId: string, event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    setSwipe({ id: threadId, startX: event.clientX, deltaX: 0 });
  }

  function handlePointerMove(threadId: string, event: PointerEvent<HTMLDivElement>) {
    if (!swipe || swipe.id !== threadId) return;
    setSwipe({ ...swipe, deltaX: event.clientX - swipe.startX });
  }

  function handlePointerEnd(threadId: string) {
    if (!swipe || swipe.id !== threadId) return;
    if (swipe.deltaX < -38) setOpenActionThreadId(threadId);
    if (swipe.deltaX > 24) setOpenActionThreadId(null);
    setSwipe(null);
  }

  if (!visibleThreads.length) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#f7f7f5] px-6 text-center">
        <div>
          <Camera className="mx-auto text-zinc-300" size={48} />
          <p className="mt-4 text-base font-black text-zinc-900">还没有拍摄会话</p>
          <p className="mt-2 text-sm leading-6 text-zinc-500">发起咨询或创建订单后，每位摄影师都会在这里生成一条聊天。</p>
          <Link className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-black px-6 text-sm font-bold text-white" to="/consumer/companions">
            去拍摄
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#f7f7f5] px-4 pb-5 pt-3 text-zinc-950">
      <header>
        <div className="flex h-10 items-center gap-2 rounded-full bg-white px-3 text-sm text-zinc-500 ring-1 ring-zinc-200">
          <Search size={16} />
          <span>搜索摄影师或订单</span>
        </div>
      </header>

      <section className="mt-3 space-y-2 pb-24">
        {visibleThreads.map((thread) => {
          const isOpen = openActionThreadId === thread.id;
          const isUnread = prefs.unreadIds.includes(thread.id);
          const isPinned = prefs.pinnedIds.includes(thread.id);
          const targetOrderId = thread.order?.id ?? thread.consultation?.id ?? sortedOrders[0]?.id;
          const translateX = swipe?.id === thread.id ? Math.min(0, Math.max(-210, swipe.deltaX)) : isOpen ? -210 : 0;

          return (
            <article key={thread.id} className="relative overflow-hidden rounded-[14px] bg-white ring-1 ring-zinc-200">
              <div className="absolute inset-y-0 right-0 grid w-[210px] grid-cols-3 text-xs font-black text-white">
                <button className="bg-[#1e88e5]" type="button" onClick={() => applyThreadAction(thread.id, 'unread')}>
                  标为未读
                </button>
                <button className="bg-[#c57a22]" type="button" onClick={() => applyThreadAction(thread.id, 'hide')}>
                  不显示
                </button>
                <button className="bg-[#ef4444]" type="button" onClick={() => applyThreadAction(thread.id, 'delete')}>
                  删除
                </button>
              </div>

              <div
                className="relative grid grid-cols-[62px_minmax(0,1fr)_58px] gap-3 bg-white px-3 py-3 transition-transform duration-200"
                style={{ transform: `translateX(${translateX}px)` }}
                onPointerDown={(event) => handlePointerDown(thread.id, event)}
                onPointerMove={(event) => handlePointerMove(thread.id, event)}
                onPointerUp={() => handlePointerEnd(thread.id)}
                onPointerCancel={() => handlePointerEnd(thread.id)}
              >
                <Link to={thread.profileUrl} className="min-w-0 text-center" aria-label={`查看${thread.name}主页`} onClick={(event) => event.stopPropagation()}>
                  {thread.avatar ? (
                    <img className="mx-auto h-12 w-12 rounded-[12px] object-cover" src={thread.avatar} alt={thread.name} />
                  ) : (
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-[12px] bg-zinc-100">
                      <Camera size={20} />
                    </div>
                  )}
                  <p className="mt-1 truncate text-xs font-black text-zinc-950">{thread.name}</p>
                </Link>

                <Link
                  to={targetOrderId ? `${basePath}/${targetOrderId}` : basePath}
                  className="min-w-0 self-center"
                  onClick={() => {
                    onUpdatePrefs((current) => ({ ...current, unreadIds: removeId(current.unreadIds, thread.id) }));
                  }}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    {isPinned ? <Pin size={12} className="shrink-0 text-zinc-400" fill="currentColor" /> : null}
                    {isUnread ? <span className="h-2 w-2 shrink-0 rounded-full bg-[#e85d75]" /> : null}
                    <p className={`truncate text-sm leading-5 ${isUnread ? 'font-black text-zinc-950' : 'font-bold text-zinc-800'}`}>{thread.lastMessage}</p>
                  </div>
                  <p className="mt-1 truncate text-xs font-semibold leading-4 text-zinc-400">{thread.orderInfo}</p>
                </Link>

                <div className="self-start text-right">
                  <p className="text-xs font-semibold text-zinc-500">{thread.dateLabel}</p>
                  <p className="mt-1 text-xs font-semibold tabular-nums text-zinc-400">{thread.timeLabel}</p>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

type MessageThread = {
  id: string;
  order?: AppOrder;
  consultation?: ConsultationRecord;
  name: string;
  avatar?: string;
  lastMessage: string;
  orderInfo: string;
  dateLabel: string;
  timeLabel: string;
  profileUrl: string;
};

function ConsultationActionPanel({
  consultation,
  sessionRole,
  onQuote,
  onAccept,
}: {
  consultation: ConsultationRecord;
  sessionRole?: string;
  onQuote: () => void;
  onAccept: () => void;
}) {
  return (
    <div className="mt-3 rounded-[14px] bg-[#fff7df] p-3 text-xs font-semibold leading-5 text-[#8a5a12] ring-1 ring-[#f2dfaa]">
      <p className="font-black">需求卡</p>
      <p className="mt-1">
        {consultation.requestCard.date} {consultation.requestCard.timeRange} · {consultation.requestCard.place} · {consultation.requestCard.peopleCount} 人 · {consultation.requestCard.packageName}
      </p>
      <p className="mt-1">{getConsultationRiskText(consultation)}</p>
      {consultation.quote ? (
        <div className="mt-2 rounded-[10px] bg-white/70 p-2 text-[#3f302c]">
          <p className="font-black">摄影师报价 {formatMoney(consultation.quote.totalCents)}</p>
          <p className="mt-1">定金 {formatMoney(consultation.quote.depositCents)} · 尾款 {formatMoney(consultation.quote.balanceCents)} 拍摄前托管</p>
          {consultation.quote.addOnLines.length ? <p className="mt-1 text-[#8f8078]">{consultation.quote.addOnLines.join(' / ')}</p> : null}
        </div>
      ) : null}
      {sessionRole === 'companion' && consultation.status === 'consulting' ? (
        <button className="mt-3 h-10 w-full rounded-full bg-[#3f302c] text-sm font-black text-white" onClick={onQuote} type="button">
          发送报价
        </button>
      ) : null}
      {sessionRole !== 'companion' && consultation.status === 'quoted' ? (
        <button className="mt-3 h-10 w-full rounded-full bg-[#e85d75] text-sm font-black text-white" onClick={onAccept} type="button">
          接受报价并支付定金
        </button>
      ) : null}
    </div>
  );
}

function buildMessageThreads(orders: AppOrder[], posts: FeedPost[], sessionRole?: string): MessageThread[] {
  return orders.map((order, index) => {
    const post = findPostForOrder(order, posts);
    return createThreadFromOrder(order, post, index, sessionRole);
  });
}

function buildConsultationThreads(consultations: ConsultationRecord[], sessionRole?: string): MessageThread[] {
  return consultations.map((consultation, index) => {
    const time = demoThreadTimes[index % demoThreadTimes.length];
    const participant = getOtherParticipantForConsultation(consultation, sessionRole);
    return {
      id: getParticipantThreadId(participant.profileUrl, participant.name),
      consultation,
      name: participant.name,
      avatar: participant.avatar,
      lastMessage: consultation.quote ? `报价 ${formatMoney(consultation.quote.totalCents)}，定金 ${formatMoney(consultation.quote.depositCents)}` : '已提交需求卡，等待摄影师报价',
      orderInfo: `${consultation.id} · ${consultation.status === 'quoted' ? '已报价' : consultation.status === 'closed' ? '已关闭' : '咨询中'} · ${consultation.requestCard.packageName}`,
      dateLabel: time.date,
      timeLabel: time.time,
      profileUrl: participant.profileUrl,
    };
  });
}

function createConversationFromConsultation(consultation: ConsultationRecord): Conversation {
  const messages = [
    {
      id: `${consultation.id}-request`,
      from: 'user' as const,
      text: `我想咨询 ${consultation.requestCard.packageName}，时间 ${consultation.requestCard.date} ${consultation.requestCard.timeRange}，地点 ${consultation.requestCard.place}。${consultation.requestCard.note || ''}`,
      sentAt: consultation.createdAt,
      riskStatus: 'clean' as const,
    },
    ...(consultation.quote
      ? [{
        id: `${consultation.id}-quote`,
        from: 'companion' as const,
        text: `我根据需求卡报价 ${formatMoney(consultation.quote.totalCents)}，定金 ${formatMoney(consultation.quote.depositCents)}，尾款 ${formatMoney(consultation.quote.balanceCents)} 拍摄前托管。`,
        sentAt: consultation.quote.createdAt,
        riskStatus: 'clean' as const,
      }]
      : []),
  ];
  return {
    id: `local-conversation-${consultation.id}`,
    orderId: consultation.id,
    orderNo: '咨询会话',
    status: 'active',
    safetyNotice: '咨询阶段请在平台内沟通，不交换联系方式，不私下转账。',
    messages,
  };
}

function createThreadFromOrder(order: AppOrder, post: FeedPost | undefined, index: number, sessionRole?: string): MessageThread {
  const time = demoThreadTimes[index % demoThreadTimes.length];
  const conversation = getConversationForOrder(order.id);
  const lastMessage = conversation.messages.at(-1);
  const participant = getOtherParticipant(order, post, sessionRole);
  const sentAt = lastMessage?.sentAt ? new Date(lastMessage.sentAt) : null;
  return {
    id: getParticipantThreadId(participant.profileUrl, participant.name),
    order,
    name: participant.name,
    avatar: participant.avatar,
    lastMessage: lastMessage?.text ?? '订单会话已创建，双方可在这里确认拍摄需求。',
    orderInfo: `${order.orderNo} · ${order.statusText} · ${formatMoney(order.amountCents)} · ${order.activityName ?? order.title}`,
    dateLabel: sentAt ? formatThreadDate(sentAt) : order.dateLabel || time.date,
    timeLabel: sentAt ? formatThreadTime(sentAt) : order.timeLabel || time.time,
    profileUrl: participant.profileUrl,
  };
}

function groupThreadsByParticipant(threads: MessageThread[]): MessageThread[] {
  const grouped = new Map<string, { thread: MessageThread; count: number; orderCount: number; consultationCount: number }>();

  for (const thread of threads) {
    const key = thread.id;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        thread,
        count: 1,
        orderCount: thread.order ? 1 : 0,
        consultationCount: thread.consultation ? 1 : 0,
      });
      continue;
    }

    current.count += 1;
    current.orderCount += thread.order ? 1 : 0;
    current.consultationCount += thread.consultation ? 1 : 0;
  }

  return Array.from(grouped.values()).map(({ thread, count, orderCount, consultationCount }) => {
    if (count <= 1) return thread;
    const countText = [
      orderCount ? `${orderCount}笔订单` : '',
      consultationCount ? `${consultationCount}个咨询` : '',
    ].filter(Boolean).join(' / ');
    return {
      ...thread,
      orderInfo: `${countText} · 最近：${thread.orderInfo}`,
    };
  });
}

function findPostForOrder(order: AppOrder | undefined, posts: FeedPost[]) {
  if (!order) return undefined;
  return posts.find((item) => item.id === order.postId || item.companion.id === order.companionId);
}

function getOtherParticipant(order: AppOrder, post: FeedPost | undefined, sessionRole?: string) {
  if (sessionRole === 'companion') {
    const creator = listTestAccounts().find((account) => account.role === 'consumer' && (account.creatorId === order.creatorId || account.phone === order.creatorPhone));
    const fallbackAvatar = post?.creator?.avatar || post?.images[1]?.url || post?.images[0]?.url;
    return {
      name: order.creatorName || creator?.name || order.creatorPhone || '预约创作者',
      avatar: creator?.avatar || fallbackAvatar,
      profileUrl: order.creatorId ? `/consumer/creator/${order.creatorId}` : '/consumer/creators',
    };
  }

  return {
    name: order.companion,
    avatar: post?.companion.avatar || post?.companion.photo || post?.images[0]?.url,
    profileUrl: `/consumer/photographer/${post?.companion.id || order.companionId}`,
  };
}

function getOtherParticipantForConsultation(consultation: ConsultationRecord, sessionRole?: string) {
  if (sessionRole === 'companion') {
    return {
      name: consultation.creatorName || consultation.creatorPhone || '咨询创作者',
      avatar: undefined,
      profileUrl: consultation.creatorId ? `/consumer/creator/${consultation.creatorId}` : '/consumer/creators',
    };
  }
  return {
    name: consultation.photographerName,
    avatar: consultation.photographerAvatar,
    profileUrl: `/consumer/photographer/${consultation.photographerId}`,
  };
}

function formatThreadDate(date: Date) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 24 * 60 * 60 * 1000;
  const value = date.getTime();
  if (value >= startToday) return '今天';
  if (value >= startYesterday) return '昨天';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatThreadTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getThreadId(orderId: string) {
  return `order-thread-${orderId}`;
}

function getParticipantThreadId(profileUrl: string, name: string) {
  return `participant-thread-${profileUrl || name}`;
}

const demoThreadTimes = [
  { date: '今天', time: '18:42' },
  { date: '今天', time: '16:18' },
  { date: '今天', time: '13:05' },
  { date: '昨天', time: '21:36' },
  { date: '昨天', time: '15:20' },
  { date: '6月11日', time: '20:08' },
  { date: '6月10日', time: '11:44' },
  { date: '6月9日', time: '19:12' },
];

function getMessageSender(role?: string) {
  if (role === 'admin') return 'admin';
  if (role === 'companion') return 'companion';
  return 'user';
}

function RiskNotice({ tone, text }: { tone: 'medium' | 'high'; text: string }) {
  const className =
    tone === 'high'
      ? 'mb-2 flex gap-2 rounded-[14px] bg-[#fff1f2] px-3 py-2 text-xs leading-5 text-[#be3450] ring-1 ring-[#ffd8df]'
      : 'mb-2 flex gap-2 rounded-[14px] bg-[#fff7df] px-3 py-2 text-xs leading-5 text-[#8a5a12] ring-1 ring-[#f2dfaa]';

  return (
    <p className={className}>
      <AlertTriangle className="mt-0.5 shrink-0" size={15} />
      <span>{text}</span>
    </p>
  );
}

function addId(ids: string[], id: string) {
  return ids.includes(id) ? ids : [...ids, id];
}

function removeId(ids: string[], id: string) {
  return ids.filter((item) => item !== id);
}

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? removeId(ids, id) : [...ids, id];
}

function normalizeThreadPrefs(prefs: ThreadPrefs): ThreadPrefs {
  return {
    pinnedIds: Array.from(new Set(prefs.pinnedIds)),
    unreadIds: Array.from(new Set(prefs.unreadIds)),
    hiddenIds: Array.from(new Set(prefs.hiddenIds)),
    deletedIds: Array.from(new Set(prefs.deletedIds)),
  };
}

function loadThreadPrefs(): ThreadPrefs {
  try {
    return normalizeThreadPrefs({ ...emptyPrefs, ...readDomainJson<Partial<ThreadPrefs>>(threadPrefsKey, {}) });
  } catch {
    return emptyPrefs;
  }
}

function saveThreadPrefs(prefs: ThreadPrefs) {
  writeDomainJson(threadPrefsKey, normalizeThreadPrefs(prefs));
}
