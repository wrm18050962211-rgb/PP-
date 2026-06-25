import { ArrowLeft, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CompanionComingSoonPage() {
  return (
    <div className="min-h-dvh bg-[#f7f7f5] px-4 pb-28 pt-5 text-zinc-950">
      <Link
        to="/companion/mine"
        className="inline-grid h-11 w-11 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-800 shadow-sm"
        aria-label="返回"
      >
        <ArrowLeft size={22} />
      </Link>

      <section className="mt-6 rounded-[10px] bg-zinc-950 p-5 text-white">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white">
          <Sparkles size={24} />
        </div>
        <p className="mt-6 text-sm font-black text-[#ff4f79]">主动邀约暂未开放</p>
        <h1 className="mt-2 text-3xl font-black tracking-normal">先处理咨询报价</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-white/62">
          为了保护双方交易安全，摄影师主动邀约会在审核、报价和纠纷规则完善后开放。当前版本先处理创作者已提交的咨询需求。
        </p>
      </section>

      <Link
        to="/companion/consultations"
        className="mt-5 flex min-h-16 items-center justify-between rounded-[10px] border border-zinc-200 bg-white px-4 text-left"
      >
        <span>
          <span className="block text-sm font-black">去处理咨询报价</span>
          <span className="mt-1 block text-xs font-semibold text-zinc-400">查看创作者需求卡，调整价格后确认</span>
        </span>
        <span className="text-lg font-black text-zinc-300">›</span>
      </Link>
    </div>
  );
}
