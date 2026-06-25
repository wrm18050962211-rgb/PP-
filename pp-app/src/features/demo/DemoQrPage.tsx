import { Camera, Check, ChevronRight, Copy, ExternalLink, Smartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createQrSvgDataUri } from './qrCode';

export function DemoQrPage() {
  const demoUrl = useMemo(() => getSurveyDemoUrl(), []);
  const qrImageUrl = useMemo(() => createQrSvgDataUri(demoUrl), [demoUrl]);
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    await navigator.clipboard?.writeText(demoUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="min-h-dvh bg-[#ecebe6] px-5 py-[max(1rem,env(safe-area-inset-top))] text-zinc-950">
      <main className="mx-auto grid min-h-[calc(100dvh-2rem)] w-full max-w-5xl gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.58fr)] lg:items-center">
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
                <div className="rounded-full bg-emerald-300 px-3 py-2 text-xs font-black text-zinc-950">创作者端</div>
              </div>

              <div>
                <p className="text-sm font-black text-white/72">问卷调研试用入口</p>
                <h1 className="mt-3 max-w-[34rem] text-[2.45rem] font-black leading-[1.03] tracking-normal sm:text-[3.5rem]">扫码直接体验创作者端</h1>
                <div className="mt-5 flex flex-wrap gap-2">
                  {['跳过注册', 'iPhone 优先', '本地试用身份'].map((item) => (
                    <span key={item} className="rounded-full bg-white/14 px-3 py-2 text-sm font-black text-white backdrop-blur">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] bg-white p-5 shadow-[0_18px_54px_rgba(24,24,27,0.13)] ring-1 ring-zinc-200">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-zinc-950 text-white">
              <Smartphone size={22} />
            </div>
            <div>
              <p className="text-base font-black">手机扫码</p>
              <p className="text-xs font-bold text-zinc-500">打开后自动进入创作者端</p>
            </div>
          </div>

          <div className="mt-5 rounded-[18px] bg-[#f6f5f1] p-4 ring-1 ring-zinc-200">
            <img className="mx-auto aspect-square w-full max-w-[320px] rounded-[12px] bg-white p-2" src={qrImageUrl} alt="创作者端试用二维码" />
          </div>

          <div className="mt-4 rounded-[12px] bg-zinc-50 px-3 py-3 ring-1 ring-zinc-200">
            <p className="break-all text-xs font-bold leading-5 text-zinc-500">{demoUrl}</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="flex h-12 items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-black text-white" type="button" onClick={() => void copyUrl()}>
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? '已复制' : '复制链接'}
            </button>
            <a className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#e85d75] text-sm font-black text-white" href={demoUrl}>
              打开试用
              <ChevronRight size={18} />
            </a>
          </div>

          <a className="mt-3 flex h-11 items-center justify-center gap-2 rounded-full bg-zinc-100 text-sm font-black text-zinc-700" href={demoUrl} target="_blank" rel="noreferrer">
            新窗口打开
            <ExternalLink size={17} />
          </a>
        </section>
      </main>
    </div>
  );
}

function getSurveyDemoUrl() {
  return 'https://wrm18050962211-rgb.github.io/PP-/d';
}
