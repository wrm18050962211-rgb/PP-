import { ArrowLeft, CalendarDays, Camera, FileQuestion, MapPin, MessageCircle, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { getConsultationRiskText, listConsultations, type ConsultationRecord } from '../../services/consultationService';

export function InquiriesPage() {
  const { session } = useAppData();
  const inquiries = useMemo(
    () => (session ? listConsultations(session).filter((item) => item.status === 'consulting') : []),
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
          询价单只展示已提交、等待摄影师报价的需求卡。摄影师确认价格后，会自动进入“我的订单”的待确认列表，再由你接受报价并支付定金。
        </p>
      </section>

      <div className="mt-4 space-y-4">
        {inquiries.map((consultation) => (
          <InquiryCard key={consultation.id} consultation={consultation} />
        ))}
      </div>

      {!inquiries.length && (
        <div className="mt-16 text-center">
          <FileQuestion className="mx-auto text-zinc-300" size={48} />
          <p className="mt-4 text-sm font-semibold text-[#8f8078]">当前没有等待报价的询价</p>
          <Link className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-[#3f302c] px-5 text-sm font-bold text-white" to="/consumer/orders?tab=paid_pending_confirm">
            查看待确认订单
          </Link>
        </div>
      )}
    </div>
  );
}

function InquiryCard({ consultation }: { consultation: ConsultationRecord }) {
  return (
    <article className="rounded-[22px] border border-[#eadfd8] bg-white p-4 shadow-[0_12px_30px_rgba(63,48,44,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#a99b94]">{consultation.id}</p>
          <h2 className="mt-1 truncate text-lg font-bold text-[#3f302c]">{consultation.requestCard.packageName}</h2>
          <p className="mt-1 truncate text-xs font-semibold text-[#8f8078]">{consultation.photographerName} · 等待报价</p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-100">待报价</span>
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

      <Link
        to={`/consumer/messages/${consultation.id}`}
        className="mt-4 flex h-10 items-center justify-center gap-2 rounded-full bg-[#3f302c] text-sm font-bold text-white"
      >
        <MessageCircle size={17} />
        进入沟通
      </Link>
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
