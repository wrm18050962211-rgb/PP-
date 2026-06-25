import { ArrowLeft, CalendarDays, Image as ImageIcon, MapPin, MessageCircle, Send, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { readCompanionPackageSettings } from '../../services/companionPackageService';
import {
  getConsultationRiskText,
  listConsultations,
  sendQuoteForConsultation,
  type ConsultationRecord,
} from '../../services/consultationService';
import { listFeedPosts } from '../../services/feedService';
import type { Companion } from '../../types/api';
import { formatMoney } from '../../utils/money';

type DraftQuote = {
  totalYuan: string;
  depositYuan: string;
};

export function CompanionConsultationsPage() {
  const { session } = useAppData();
  const [version, setVersion] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, DraftQuote>>({});
  const [quoteFeedback, setQuoteFeedback] = useState<Record<string, string>>({});
  const posts = useMemo(() => listFeedPosts(), []);
  const companionById = useMemo(() => new Map(posts.map((post) => [post.companion.id, post.companion])), [posts]);
  const consultations = useMemo(
    () => listConsultations(session).filter((consultation) => consultation.status !== 'closed'),
    [session, version],
  );

  const updateDraft = (id: string, patch: Partial<DraftQuote>) => {
    setDrafts((current) => {
      const currentDraft = current[id] ?? { totalYuan: '', depositYuan: '' };
      return { ...current, [id]: { ...currentDraft, ...patch } };
    });
  };

  const handleSendQuote = (consultation: ConsultationRecord) => {
    const companion = companionById.get(consultation.photographerId);
    const estimate = estimateQuote(consultation, companion);
    const draft = drafts[consultation.id] ?? createDraftFromCents(consultation.quote?.totalCents ?? estimate.totalCents, consultation.quote?.depositCents ?? estimate.depositCents);
    const totalCents = parseYuanToCents(draft.totalYuan);
    const depositCents = parseYuanToCents(draft.depositYuan);

    if (totalCents === null || totalCents <= 0) {
      setQuoteFeedback((current) => ({ ...current, [consultation.id]: '请输入有效总价后再确认报价。' }));
      return;
    }
    if (depositCents === null || depositCents < 0 || depositCents > totalCents) {
      setQuoteFeedback((current) => ({ ...current, [consultation.id]: '定金不能大于总价，也不能小于 0。' }));
      return;
    }

    const next = sendQuoteForConsultation(consultation.id, companion, { totalCents, depositCents });
    if (!next?.quote) {
      setQuoteFeedback((current) => ({ ...current, [consultation.id]: '报价保存失败，请稍后再试。' }));
      return;
    }
    const savedQuote = next.quote;
    setDrafts((current) => ({ ...current, [consultation.id]: createDraftFromCents(savedQuote.totalCents, savedQuote.depositCents) }));
    setQuoteFeedback((current) => ({ ...current, [consultation.id]: '报价已发送给创作者，可在聊天页继续沟通。' }));
    setVersion((value) => value + 1);
  };

  return (
    <div className="min-h-dvh bg-[#f7f7f5] px-4 pb-8 pt-5 text-zinc-950">
      <header className="flex items-center gap-3">
        <Link
          to="/companion/mine"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-800 shadow-sm"
          aria-label="返回"
        >
          <ArrowLeft size={22} />
        </Link>
        <div>
          <p className="text-sm font-black text-[#ff4f79]">摄影师工作台</p>
          <h1 className="text-3xl font-black tracking-normal">咨询报价</h1>
        </div>
      </header>

      <section className="mt-5 rounded-[10px] bg-zinc-950 p-5 text-white">
        <p className="text-lg font-black">先看完整需求卡，再确认报价</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-white/58">
          创作者提交需求后还不是订单。你可以根据日期、地点、人数和附加需求调整总价与定金，发送报价后等待创作者接受并支付定金。
        </p>
      </section>

      <div className="mt-5 space-y-4">
        {consultations.length ? (
          consultations.map((consultation) => {
            const companion = companionById.get(consultation.photographerId);
            const estimate = estimateQuote(consultation, companion);
            const totalCents = consultation.quote?.totalCents ?? estimate.totalCents;
            const depositCents = consultation.quote?.depositCents ?? estimate.depositCents;
            const draft = drafts[consultation.id] ?? createDraftFromCents(totalCents, depositCents);
            const draftTotalCents = parseYuanToCents(draft.totalYuan) ?? totalCents;
            const draftDepositCents = parseYuanToCents(draft.depositYuan) ?? depositCents;
            const draftBalanceCents = Math.max(0, draftTotalCents - draftDepositCents);
            const quoteInvalid = draftTotalCents <= 0 || draftDepositCents < 0 || draftDepositCents > draftTotalCents;
            const feedback = quoteFeedback[consultation.id];

            return (
              <article key={consultation.id} className="rounded-[10px] border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-zinc-400">{consultation.id}</p>
                    <h2 className="mt-1 truncate text-xl font-black">{consultation.creatorName || consultation.creatorPhone || '咨询创作者'}</h2>
                    <p className="mt-1 text-xs font-semibold text-zinc-400">
                      {consultation.status === 'quoted' ? '已报价，可再次调整' : consultation.status === 'closed' ? '已关闭' : '待报价'}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#fff1f3] px-3 py-1 text-xs font-black text-[#e85d75]">
                    {consultation.status === 'quoted' ? '已报价' : consultation.status === 'closed' ? '已关闭' : '新询价'}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 text-sm font-semibold text-zinc-700">
                  <InfoLine icon={CalendarDays} label="日期时间" value={`${consultation.requestCard.date} ${consultation.requestCard.timeRange}`} />
                  <InfoLine icon={MapPin} label="地点" value={consultation.requestCard.place} />
                  <InfoLine icon={UserRound} label="人数" value={`${consultation.requestCard.peopleCount} 人 · ${consultation.requestCard.sceneType === 'outdoor' ? '室外' : '室内'}`} />
                  <InfoLine icon={ImageIcon} label="套餐" value={consultation.requestCard.packageName} />
                </div>

                <div className="mt-4 rounded-[8px] bg-[#f7f7f5] p-3 text-xs font-semibold leading-5 text-zinc-600">
                  <p className="font-black text-zinc-950">附加需求</p>
                  <p className="mt-1">{formatAddOns(consultation)}</p>
                  {consultation.requestCard.note ? <p className="mt-2 text-zinc-500">备注：{consultation.requestCard.note}</p> : null}
                  <p className="mt-2 text-zinc-400">{getConsultationRiskText(consultation)}</p>
                </div>

                {consultation.requestCard.referenceImages.length ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto">
                    {consultation.requestCard.referenceImages.slice(0, 6).map((src, index) => (
                      <img
                        key={`${consultation.id}-reference-${index}`}
                        src={src}
                        alt="参考图"
                        className="h-16 w-16 shrink-0 rounded-[8px] object-cover"
                      />
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-black text-zinc-500">总价（元）</span>
                    <input
                      className="mt-1 h-12 w-full rounded-[8px] bg-[#f7f7f5] px-3 text-base font-black outline-none ring-1 ring-transparent focus:ring-zinc-300"
                      inputMode="numeric"
                      min={1}
                      type="number"
                      value={draft.totalYuan}
                      onChange={(event) => updateDraft(consultation.id, { totalYuan: event.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-black text-zinc-500">定金（元）</span>
                    <input
                      className="mt-1 h-12 w-full rounded-[8px] bg-[#f7f7f5] px-3 text-base font-black outline-none ring-1 ring-transparent focus:ring-zinc-300"
                      inputMode="numeric"
                      min={0}
                      type="number"
                      value={draft.depositYuan}
                      onChange={(event) => updateDraft(consultation.id, { depositYuan: event.target.value })}
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-[8px] border border-zinc-100 p-3 text-xs font-semibold text-zinc-500">
                  <p>
                    待发送报价：<span className="font-black text-zinc-950">{formatMoney(draftTotalCents)}</span> · 定金{' '}
                    <span className="font-black text-zinc-950">{formatMoney(draftDepositCents)}</span> · 尾款{' '}
                    <span className="font-black text-zinc-950">{formatMoney(draftBalanceCents)}</span>
                  </p>
                  {consultation.quote?.addOnLines.length ? <p className="mt-1">{consultation.quote.addOnLines.join(' / ')}</p> : null}
                  {quoteInvalid ? <p className="mt-2 text-rose-500">请检查总价和定金，定金不能超过总价。</p> : null}
                  {feedback ? <p className={`mt-2 ${feedback.includes('已发送') ? 'text-emerald-600' : 'text-rose-500'}`}>{feedback}</p> : null}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Link
                    to={`/companion/messages/${consultation.id}`}
                    className="flex h-12 items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white text-sm font-black"
                  >
                    <MessageCircle size={18} />
                    进入沟通
                  </Link>
                  <button
                    type="button"
                    className="flex h-12 items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-black text-white disabled:bg-zinc-200 disabled:text-zinc-400"
                    onClick={() => handleSendQuote(consultation)}
                    disabled={consultation.status === 'closed' || quoteInvalid}
                  >
                    <Send size={18} />
                    {consultation.status === 'quoted' ? '更新报价' : '确认报价'}
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-[10px] border border-dashed border-zinc-200 bg-white px-6 py-14 text-center">
            <p className="text-lg font-black">暂无咨询报价</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-zinc-400">创作者提交需求卡后，会在这里出现完整报价单。</p>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoLine({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={16} className="shrink-0 text-zinc-400" />
      <span className="w-16 shrink-0 text-zinc-400">{label}</span>
      <span className="min-w-0 flex-1 truncate text-zinc-950">{value}</span>
    </div>
  );
}

function formatAddOns(consultation: ConsultationRecord) {
  const card = consultation.requestCard;
  const items = [
    `图片数量 ${formatImageQuantity(card)}`,
    card.needsRetouch ? `修图 ${formatRetouch(card.retouchSelection, card.customRetouchCount)}` : '不需要修图',
    card.needsVideo ? `视频 ${card.videoCount ?? 1} 条 · 平均 ${card.videoAverageDurationSeconds ?? 15} 秒` : '不需要视频',
    card.needsPolaroid ? `拍立得/胶片 ${card.polaroidCount ?? 1} 张` : '不需要拍立得/胶片',
    card.acceptsPublication ? '接受客片发布' : '不接受客片发布',
    card.needsRoutePlanning ? '需要路线规划' : '不需要路线规划',
    card.needsCompanionQueueing ? '包含陪逛/排队' : '不包含陪逛/排队',
    card.hasTicketOrEntry ? '涉及门票/入园' : '不涉及门票/入园',
  ];
  return items.join(' · ');
}

function formatImageQuantity(card: ConsultationRecord['requestCard']) {
  if (card.imageQuantityMode === 'unlimited') return '不限';
  if (card.imageQuantityMode === 'custom') return `${card.customImageQuantity ?? 12} 张`;
  return `${card.imageQuantityMode ?? '9'} 张`;
}

function formatRetouch(selection?: ConsultationRecord['requestCard']['retouchSelection'], customCount?: number) {
  if (selection === 'all') return '全部';
  if (selection === 'custom') return `${customCount ?? 1} 张`;
  return `${selection ?? '4'} 张`;
}

function estimateQuote(consultation: ConsultationRecord, companion?: Companion) {
  const settings = readCompanionPackageSettings(companion);
  const selectedPackage = settings.packages.find((pkg) => pkg.id === consultation.requestCard.packageId) ?? settings.packages[0];
  let totalCents = selectedPackage.basePriceCents;
  const addOns = settings.addOns;
  const hours = Math.max(1, selectedPackage.durationMinutes / 60);
  const extraPeople = Math.max(0, consultation.requestCard.peopleCount - 1);

  totalCents += extraPeople * addOns.extraPersonPerHourCents * hours;
  if (consultation.requestCard.needsVideo) totalCents += addOns.videoPerClipCents * Math.max(1, consultation.requestCard.videoCount ?? 1);
  if (consultation.requestCard.needsPolaroid) totalCents += addOns.polaroidPerShotCents * Math.max(1, consultation.requestCard.polaroidCount ?? 1);
  if (consultation.requestCard.sceneType === 'outdoor') totalCents += addOns.outdoorFeeCents;
  totalCents += addOns.travelFeeCents;

  return {
    totalCents,
    depositCents: Math.min(totalCents, selectedPackage.depositCents),
  };
}

function createDraftFromCents(totalCents: number, depositCents: number): DraftQuote {
  return {
    totalYuan: String(Math.round(totalCents / 100)),
    depositYuan: String(Math.round(depositCents / 100)),
  };
}

function parseYuanToCents(value: string | undefined) {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : null;
}
