import { Camera, Check, ChevronRight, Copy, ExternalLink, Smartphone, UserRound, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createQrSvgDataUri } from './qrCode';

type DemoTarget = {
  id: 'creator' | 'photographer';
  title: string;
  desc: string;
  url: string;
  icon: LucideIcon;
  tone: string;
};

export function DemoQrPage() {
  const demoTargets = useMemo(() => getSurveyDemoTargets(), []);
  const cards = useMemo(
    () =>
      demoTargets.map((target) => ({
        ...target,
        qrImageUrl: createQrSvgDataUri(target.url),
      })),
    [demoTargets],
  );
  const [copiedKey, setCopiedKey] = useState<DemoTarget['id'] | ''>('');

  async function copyUrl(target: DemoTarget) {
    await navigator.clipboard?.writeText(target.url);
    setCopiedKey(target.id);
    window.setTimeout(() => setCopiedKey(''), 1600);
  }

  return (
    <div className="min-h-dvh bg-[#ecebe6] px-5 py-[max(1rem,env(safe-area-inset-top))] text-zinc-950">
      <main className="mx-auto grid min-h-[calc(100dvh-2rem)] w-full max-w-6xl gap-5 lg:grid-cols-[minmax(0,0.84fr)_minmax(410px,0.76fr)] lg:items-center">
        <section className="overflow-hidden rounded-[28px] bg-[#050505] text-white shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
          <div className="relative min-h-[54dvh] lg:min-h-[720px]">
            <img
              className="absolute inset-0 h-full w-full object-cover opacity-78"
              src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1400&q=82"
              alt=""
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.78))]" />
            <div className="relative flex min-h-[54dvh] flex-col justify-between p-5 lg:min-h-[720px] lg:p-7">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 rounded-full bg-white/12 px-3 py-2 backdrop-blur">
                  <Camera size={17} />
                  <span className="text-sm font-black">PP Demo</span>
                </div>
                <div className="rounded-full bg-emerald-300 px-3 py-2 text-xs font-black text-zinc-950">主分支</div>
              </div>

              <div>
                <p className="text-sm font-black text-white/72">问卷调研试用入口</p>
                <h1 className="mt-3 max-w-[34rem] text-[2.45rem] font-black leading-[1.03] tracking-normal sm:text-[3.5rem]">扫码体验双端 Demo</h1>
                <div className="mt-5 flex flex-wrap gap-2">
                  {['跳过注册', 'iPhone 优先', 'GitHub 主分支'].map((item) => (
                    <span key={item} className="rounded-full bg-white/14 px-3 py-2 text-sm font-black text-white backdrop-blur">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] bg-white p-4 shadow-[0_18px_54px_rgba(24,24,27,0.13)] ring-1 ring-zinc-200 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-zinc-950 text-white">
              <Smartphone size={22} />
            </div>
            <div>
              <p className="text-base font-black">手机扫码</p>
              <p className="text-xs font-bold text-zinc-500">打开后自动进入对应端口</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {cards.map((target) => {
              const Icon = target.icon;
              const copied = copiedKey === target.id;
              return (
                <article key={target.id} className="rounded-[18px] bg-[#f6f5f1] p-3 ring-1 ring-zinc-200">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-white ${target.tone}`}>
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-black leading-6">{target.title}</h2>
                      <p className="mt-0.5 text-xs font-bold leading-5 text-zinc-500">{target.desc}</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-[14px] bg-white p-2 ring-1 ring-zinc-200">
                    <img className="mx-auto aspect-square w-full max-w-[236px]" src={target.qrImageUrl} alt={`${target.title}二维码`} />
                  </div>

                  <div className="mt-3 rounded-[12px] bg-white px-3 py-2 ring-1 ring-zinc-200">
                    <p className="break-all text-[11px] font-bold leading-5 text-zinc-500">{target.url}</p>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-zinc-950 px-2 text-xs font-black text-white"
                      type="button"
                      onClick={() => void copyUrl(target)}
                    >
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      {copied ? '已复制' : '复制'}
                    </button>
                    <a className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-[#e85d75] px-2 text-xs font-black text-white" href={target.url}>
                      打开
                      <ChevronRight size={16} />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>

          <a className="mt-4 flex h-11 items-center justify-center gap-2 rounded-full bg-zinc-100 text-sm font-black text-zinc-700" href={cards[0]?.url} target="_blank" rel="noreferrer">
            新窗口打开创作者端
            <ExternalLink size={17} />
          </a>
        </section>
      </main>
    </div>
  );
}

function getSurveyDemoTargets(): DemoTarget[] {
  const baseUrl = 'https://wrm18050962211-rgb.github.io/PP-';
  return [
    {
      id: 'creator',
      title: '创作者端',
      desc: '浏览作品、匹配摄影师、进入预约流程',
      url: `${baseUrl}/d/creator`,
      icon: UserRound,
      tone: 'bg-zinc-950',
    },
    {
      id: 'photographer',
      title: '摄影师端',
      desc: '查看接单、咨询报价、档期与资料管理',
      url: `${baseUrl}/d/photographer`,
      icon: Camera,
      tone: 'bg-[#2f6f73]',
    },
  ];
}
