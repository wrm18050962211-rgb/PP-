import { ArrowLeft, CalendarDays, Camera, FileQuestion, MapPin, MessageCircle, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import {
  estimateConsultationQuote,
  getConsultationRiskText,
  listConsultations,
  type ConsultationQuoteEstimate,
  type ConsultationRecord,
} from '../../services/consultationService';
import { listFeedPosts } from '../../services/feedService';
import { formatMoney } from '../../utils/money';

export function InquiriesPage() {
  const { session } = useAppData();
  const posts = useMemo(() => listFeedPosts(), []);
  const inquiries = useMemo(
    () => (session ? listConsultations(session).filter((item) => item.status !== 'closed') : []),
    [session],
  );

  return (
    <div className="min-h-dvh pp-page px-4 py-5">
      <header className="flex items-start gap-3">
        <Link className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/82 text-[#3f302c] ring-1 ring-[#eadfd8]" to="/consumer/mine" aria-label="返回我的">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[#e85d75]">咨询档期/报价</p>
          <h1 className="mt-1 text-2xl font-bold text-[#3f302c]">我的询价</h1>
        </div>
      </header>

      <section className="mt-4 rounded-[16px] bg-white/78 p-3 text-[#3f302c] ring-1 ring-[#eadfd8]">
        <p className="text-xs font-black text-[#e85d75]">这里还不是订单</p>
        <p className="mt-1 text-xs leading-5 text-[#8f8078]">
          询价单展示已提交的需求卡。摄影师确认价格后，这里会显示订单原报价和摄影师调整后的价格；你需要到“我的订单”的待确认栏确认后，该询价才会移除。
        </p>
      </section>

      <div className="mt-4 space-y-4">
        {inquiries.map((consultation) => {
          const companion = posts.find((post) => post.companion.id === consultation.photographerId)?.companion;
          const estimate = estimateConsultationQuote(consultation, companion);
          return <InquiryCard key={consultation.id} consultation={consultation} estimate={estimate} />;
        })}
      </div>

      {!inquiries.length && (
        <div className="mt-16 text-center">
          <FileQuestion className="mx-auto text-zinc-300" size={48} />
          <p className="mt-4 text-sm font-semibold text-[#8f8078]">当前没有进行中的询价</p>
          <Link className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-[#3f302c] px-5 text-sm font-bold text-white" to="/consumer/orders?tab=paid_pending_confirm">
            查看待确认订单
          </Link>
        </div>
      )}
    </div>
  );
}

function InquiryCard({ consultation, estimate }: { consultation: ConsultationRecord; estimate: ConsultationQuoteEstimate }) {
  const quote = consultation.quote;
  const adjusted = Boolean(quote && (quote.totalCents !== estimate.totalCents || quote.depositCents !== estimate.depositCents));
  const quoted = consultation.status === 'quoted' && quote;

  return (
    <article className="rounded-[22px] border border-[#eadfd8] bg-white p-4 shadow-[0_12px_30px_rgba(63,48,44,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#a99b94]">{consultation.id}</p>
          <h2 className="mt-1 truncate text-lg font-bold text-[#3f302c]">{consultation.requestCard.packageName}</h2>
          <p className="mt-1 truncate text-xs font-semibold text-[#8f8078]">{consultation.photographerName} · {quoted ? '摄影师已报价' : '等待报价'}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ${
            quoted ? 'bg-[#fff1f3] text-[#e85d75] ring-[#ffdce4]' : 'bg-amber-50 text-amber-700 ring-amber-100'
          }`}
        >
          {quoted ? '已报价' : '待报价'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-sm">
        <DetailLine icon={<Camera size={17} />} label="摄影师" value={consultation.photographerName} />
        <DetailLine icon={<MapPin size={17} />} label="地点" value={consultation.requestCard.place} />
        <DetailLine icon={<CalendarDays size={17} />} label="时间" value={`${consultation.requestCard.date} ${consultation.requestCard.timeRange}`} />
        <DetailLine icon={<Users size={17} />} label="人数" value={`${consultation.requestCard.peopleCount} 人 · ${consultation.requestCard.sceneType === 'outdoor' ? '室外' : '室内'}`} />
      </div>

      <div className="mt-4 rounded-[18px] bg-[#fff5f1] p-3 text-xs font-semibold leading-5 text-[#6f625d]">
        <p>{formatAddOns(consultation)}</p>
        {consultation.requestCard.note ? <p className="mt-2 text-[#8f8078]">备注：{consultation.requestCard.note}</p> : null}
        <p className="mt-2 text-[#a99b94]">{getConsultationRiskText(consultation)}</p>
      </div>

      {quote ? (
        <div className="mt-4 rounded-[18px] border border-[#eadfd8] bg-white/70 p-3 text-sm font-semibold leading-6 text-[#6f625d]">
          <PriceLine label="订单原报价" value={formatMoney(estimate.totalCents)} muted={adjusted} />
          <PriceLine label="摄影师调整价" value={formatMoney(quote.totalCents)} strong />
          <PriceLine label="定金托管" value={formatMoney(quote.depositCents)} />
          <PriceLine label="拍摄前尾款" value={formatMoney(quote.balanceCents)} />
          {adjusted ? <p className="mt-2 text-xs text-[#a99b94]">摄影师已调整价格，请到订单待确认栏确认。</p> : null}
        </div>
      ) : null}

      <div className={`mt-4 grid gap-2 ${quoted ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Link
          to={`/consumer/messages/${consultation.id}`}
          className="flex h-10 items-center justify-center gap-2 rounded-full bg-[#f2e8e1] text-sm font-bold text-[#6f625d]"
        >
          <MessageCircle size={17} />
          进入沟通
        </Link>
        {quoted ? (
          <Link
            to="/consumer/orders?tab=paid_pending_confirm"
            className="flex h-10 items-center justify-center rounded-full bg-[#3f302c] text-sm font-bold text-white"
          >
            去订单确认
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function DetailLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[24px_76px_minmax(0,1fr)] items-center gap-2">
      <span className="text-[#a99b94]">{icon}</span>
      <span className="font-semibold text-[#a99b94]">{label}</span>
      <span className="min-w-0 truncate font-bold text-[#3f302c]">{value}</span>
    </div>
  );
}

function formatAddOns(consultation: ConsultationRecord) {
  const card = consultation.requestCard;
  return [
    card.needsRetouch ? `需要修图 ${formatRetouch(card.retouchSelection, card.customRetouchCount)}` : '不需要修图',
    card.needsVideo ? `需要视频 ${card.videoCount ?? 1} 条` : '不需要视频',
    card.needsPolaroid ? `拍立得/胶片 ${card.polaroidCount ?? 1} 张` : '不需要拍立得/胶片',
    card.acceptsPublication ? '接受客片发布' : '不接受客片发布',
    card.needsRoutePlanning ? '需要路线规划' : '不需要路线规划',
  ].join(' · ');
}

function formatRetouch(selection?: ConsultationRecord['requestCard']['retouchSelection'], customCount?: number) {
  if (selection === 'all') return '全部';
  if (selection === 'custom') return `${customCount ?? 1} 张`;
  return `${selection ?? '4'} 张`;
}

function PriceLine({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#a99b94]">{label}</span>
      <span className={`${strong ? 'text-base font-black text-[#3f302c]' : muted ? 'text-[#b5a9a3] line-through' : 'font-bold text-[#3f302c]'}`}>{value}</span>
    </div>
  );
}
