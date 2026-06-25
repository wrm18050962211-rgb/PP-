import { Camera, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { startCompanionDemoSession, startCreatorDemoSession, type DemoRole } from './demoSession';

const demoGateCopy = {
  consumer: {
    eyebrow: 'PP 创作者端试用',
    title: '正在进入创作者端',
    subtitle: '已为本次调研准备好创作者试用身份，无需注册。',
    loadingTitle: '正在准备创作者环境',
    loadingDesc: '创作者身份 · 浏览作品 · 预约流程',
    target: '/consumer',
  },
  companion: {
    eyebrow: 'PP 摄影师端试用',
    title: '正在进入摄影师端',
    subtitle: '已为本次调研准备好摄影师试用身份，无需注册。',
    loadingTitle: '正在准备摄影师环境',
    loadingDesc: '摄影师身份 · 接单报价 · 档期管理',
    target: '/companion/mine',
  },
} satisfies Record<DemoRole, { eyebrow: string; title: string; subtitle: string; loadingTitle: string; loadingDesc: string; target: string }>;

export function CreatorDemoGate({ role = 'consumer' }: { role?: DemoRole }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const copy = demoGateCopy[role];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (role === 'companion') {
          startCompanionDemoSession();
        } else {
          startCreatorDemoSession();
        }
        navigate(copy.target, { replace: true });
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : '试用入口启动失败');
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [copy.target, navigate, role]);

  return (
    <div className="min-h-dvh bg-[#050505] px-5 py-[max(1rem,env(safe-area-inset-top))] text-white">
      <main className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col justify-between overflow-hidden rounded-[28px] bg-[#f7f7f5] text-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
        <section className="relative min-h-[58dvh] overflow-hidden bg-zinc-950 text-white">
          <img
            className="absolute inset-0 h-full w-full object-cover opacity-72"
            src="https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&w=1200&q=82"
            alt=""
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.72))]" />
          <div className="relative flex min-h-[58dvh] flex-col justify-end px-5 pb-6">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-[16px] bg-white text-zinc-950 shadow-lg">
              <Camera size={24} />
            </div>
            <p className="text-sm font-black text-white/78">{copy.eyebrow}</p>
            <h1 className="mt-2 text-[2rem] font-black leading-[1.05] tracking-normal">{copy.title}</h1>
            <p className="mt-3 max-w-[18rem] text-sm font-bold leading-6 text-white/74">{copy.subtitle}</p>
          </div>
        </section>

        <section className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
          {error ? (
            <div className="rounded-[12px] bg-rose-50 p-4 text-sm font-bold leading-6 text-rose-700">{error}</div>
          ) : (
            <div className="flex items-center justify-between rounded-[18px] bg-white p-4 shadow-[0_14px_36px_rgba(24,24,27,0.08)] ring-1 ring-zinc-200">
              <div>
                <p className="text-sm font-black">{copy.loadingTitle}</p>
                <p className="mt-1 text-xs font-bold text-zinc-500">{copy.loadingDesc}</p>
              </div>
              <Loader2 className="animate-spin text-zinc-950" size={24} />
            </div>
          )}

          <Link className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-black text-white" to={copy.target} replace>
            直接进入
            <ChevronRight size={18} />
          </Link>
        </section>
      </main>
    </div>
  );
}
