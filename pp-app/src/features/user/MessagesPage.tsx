import { AlertTriangle, ChevronLeft, Flag, LockKeyhole, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { evaluateMessageRisk, fetchConversation, getConversation, saveLocalConversation, sendMessage } from '../../services/messageService';
import type { Conversation } from '../../types/api';
import { formatMoney } from '../../utils/money';

export function MessagesPage() {
  const { orderId } = useParams();
  const { orders } = useAppData();
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
      setSendBlocked(true);
      return;
    }

    if (isMediumRiskWaiting) {
      setAllowMediumRisk(true);
      return;
    }

    const result = await sendMessage(conversation.id, content);
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
      <div className="grid min-h-dvh place-items-center bg-zinc-50 px-6 text-center">
        <div>
          <p className="text-base font-bold text-zinc-900">暂无可沟通订单</p>
          <Link className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-bold text-white" to="/consumer/orders">
            返回订单
          </Link>
        </div>
      </div>
    );
  }

  const riskKeywords = risk.hits.map((hit) => hit.keyword).join('、');

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Link className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700" to="/consumer/orders" aria-label="返回订单">
            <ChevronLeft size={20} />
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-base font-bold text-zinc-950">订单沟通</h1>
            <p className="mt-0.5 truncate text-xs text-zinc-500">{conversation.orderNo}</p>
          </div>
          <button
            className={`grid h-9 w-9 place-items-center rounded-full ${reportSent ? 'bg-rose-50 text-rose-500' : 'bg-zinc-100 text-zinc-700'}`}
            aria-label="举报"
            onClick={() => setReportSent(true)}
            type="button"
          >
            <Flag size={18} />
          </button>
        </div>
        {reportSent && <p className="mt-2 text-center text-xs font-semibold text-rose-500">举报已记录，平台会优先复核这笔订单沟通。</p>}
      </header>

      <section className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-400">{activeOrder.orderNo}</p>
            <h2 className="mt-1 truncate text-lg font-bold text-zinc-950">{activeOrder.title}</h2>
            <p className="mt-1 truncate text-xs text-zinc-500">
              {activeOrder.companion} · {activeOrder.dateLabel ?? activeOrder.time} {activeOrder.timeLabel ?? ''}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold text-zinc-950">{formatMoney(activeOrder.amountCents)}</p>
            <p className="mt-1 text-xs text-zinc-400">{activeOrder.statusText}</p>
          </div>
        </div>
      </section>

      <section className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <div className="flex gap-2 rounded-[8px] bg-amber-50 p-3 text-xs leading-5 text-amber-800 ring-1 ring-amber-100">
          <ShieldCheck className="mt-0.5 shrink-0" size={16} />
          <span>请只围绕本订单沟通时间、地点、拍摄需求和服务确认。不要交换联系方式，不要私下转账或绕开平台付款。</span>
        </div>

        {conversation.messages.map((message) => (
          <div key={message.id} className={`flex ${message.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                message.from === 'user' ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-800 ring-1 ring-zinc-200'
              }`}
            >
              <p>{message.text}</p>
              {message.riskStatus === 'flagged' && <p className="mt-1 text-[11px] text-amber-500">已提示风险</p>}
            </div>
          </div>
        ))}
      </section>

      <footer className="sticky bottom-16 border-t border-zinc-200 bg-white p-3">
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
            className="max-h-28 min-h-11 flex-1 resize-none rounded-[8px] bg-zinc-100 px-4 py-3 text-sm leading-5 outline-none focus:ring-2 focus:ring-zinc-300"
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
              risk.shouldBlock ? 'bg-zinc-300' : isMediumRiskWaiting ? 'bg-amber-500' : 'bg-rose-500'
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

function RiskNotice({ tone, text }: { tone: 'medium' | 'high'; text: string }) {
  const className =
    tone === 'high'
      ? 'mb-2 flex gap-2 rounded-[8px] bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700 ring-1 ring-rose-100'
      : 'mb-2 flex gap-2 rounded-[8px] bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 ring-1 ring-amber-100';

  return (
    <p className={className}>
      <AlertTriangle className="mt-0.5 shrink-0" size={15} />
      <span>{text}</span>
    </p>
  );
}
