import { AlertTriangle, ChevronLeft, Flag, LockKeyhole, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { evaluateMessageRisk, fetchConversation, getConversation, saveLocalConversation, sendMessage, submitOrderReport } from '../../services/messageService';
import type { Conversation } from '../../types/api';
import { formatMoney } from '../../utils/money';

export function MessagesPage() {
  const { orderId } = useParams();
  const { orders, session } = useAppData();
  const activeOrder = useMemo(() => orders.find((order) => order.id === orderId) ?? orders[0], [orderId, orders]);
  const [draft, setDraft] = useState('');
  const [conversation, setConversation] = useState<Conversation>(() => getConversation());
  const [allowMediumRisk, setAllowMediumRisk] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [sendBlocked, setSendBlocked] = useState(false);
  const risk = useMemo(() => evaluateMessageRisk(draft), [draft]);
  const isMediumRiskWaiting = risk.level === 'medium' && !allowMediumRisk;

  useEffect(() => {
    let mounted = true;
    fetchConversation(activeOrder?.id).then((nextConversation) => {
      if (mounted && activeOrder) {
        setConversation({
          ...nextConversation,
          id: nextConversation.id || `local-conversation-${activeOrder.id}`,
          orderId: activeOrder.id,
          orderNo: activeOrder.orderNo,
        });
      }
    });

    return () => {
      mounted = false;
    };
  }, [activeOrder]);

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

  if (!activeOrder) {
    return (
      <div className="grid min-h-dvh place-items-center pp-page px-6 text-center">
        <div>
          <p className="text-base font-bold text-zinc-900">暂无可沟通订单</p>
          <Link className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-[#3f302c] px-5 text-sm font-bold text-white" to="/consumer/orders">
            返回订单
          </Link>
        </div>
      </div>
    );
  }

  const riskKeywords = risk.hits.map((hit) => hit.keyword).join('、');

  return (
    <div className="flex min-h-dvh flex-col pp-page">
      <header className="border-b border-[#eadfd8] bg-[#fbf7f2]/92 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Link className="grid h-9 w-9 place-items-center rounded-full bg-white/78 text-[#3f302c] ring-1 ring-[#eadfd8]" to="/consumer/orders" aria-label="返回订单">
            <ChevronLeft size={20} />
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-base font-bold text-[#3f302c]">订单沟通</h1>
            <p className="mt-0.5 truncate text-xs text-[#8f8078]">{conversation.orderNo}</p>
          </div>
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
        {reportSent && <p className="mt-2 text-center text-xs font-semibold text-rose-500">举报已记录，平台会优先复核这笔订单沟通。</p>}
      </header>

      <section className="border-b border-[#eadfd8] bg-white/72 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#a99b94]">{activeOrder.orderNo}</p>
            <h2 className="mt-1 truncate text-lg font-bold text-[#3f302c]">{activeOrder.title}</h2>
            <p className="mt-1 truncate text-xs text-[#8f8078]">
              {activeOrder.companion} · {activeOrder.dateLabel ?? activeOrder.time} {activeOrder.timeLabel ?? ''}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold text-[#3f302c]">{formatMoney(activeOrder.amountCents)}</p>
            <p className="mt-1 text-xs text-[#a99b94]">{activeOrder.statusText}</p>
          </div>
        </div>
      </section>

      <section className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <div className="flex gap-2 rounded-[18px] bg-[#fff7df] p-3 text-xs leading-5 text-[#8a5a12] ring-1 ring-[#f2dfaa]">
          <ShieldCheck className="mt-0.5 shrink-0" size={16} />
          <span>请只围绕本订单沟通时间、地点、拍摄需求和服务确认。不要交换联系方式，不要私下转账或绕开平台付款。</span>
        </div>

        {conversation.messages.map((message) => (
          <div key={message.id} className={`flex ${message.from === getMessageSender(session?.role) ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                message.from === getMessageSender(session?.role) ? 'bg-[#3f302c] text-white' : 'bg-white/86 text-[#3f302c] ring-1 ring-[#eadfd8]'
              }`}
            >
              <p>{message.text}</p>
              {message.riskStatus === 'flagged' && <p className="mt-1 text-[11px] text-amber-500">已提示风险</p>}
            </div>
          </div>
        ))}
      </section>

      <footer className="sticky bottom-16 border-t border-[#eadfd8] bg-[#fffaf6]/96 p-3 backdrop-blur">
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
