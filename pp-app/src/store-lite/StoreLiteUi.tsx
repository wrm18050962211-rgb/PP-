import { AlertCircle, ArrowLeft, LoaderCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function StoreLiteLoading({ label }: { label: string }) {
  return (
    <div className="grid min-h-[48dvh] place-items-center px-6 text-center text-current">
      <div>
        <LoaderCircle className="mx-auto animate-spin opacity-45" size={25} />
        <p className="mt-3 text-sm font-bold opacity-55">{label}</p>
      </div>
    </div>
  );
}

export function StoreLiteError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-4 my-8 rounded-[10px] border border-rose-300/25 bg-rose-950/[0.12] p-5 text-center text-rose-700">
      <AlertCircle className="mx-auto" size={24} />
      <p className="mt-3 text-sm font-bold leading-6">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-zinc-950 px-5 text-sm font-black text-white">
          <RefreshCw size={15} />
          重试
        </button>
      ) : null}
    </div>
  );
}

export function StoreLitePageHeader({ title, eyebrow, back = true }: { title: string; eyebrow?: string; back?: boolean }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-20 flex min-h-[68px] items-center gap-3 border-b border-zinc-200/70 bg-[#f7f7f5]/94 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      {back ? (
        <button type="button" onClick={() => navigate(-1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white shadow-sm ring-1 ring-zinc-200" aria-label="返回">
          <ArrowLeft size={21} />
        </button>
      ) : null}
      <div className="min-w-0 py-3">
        {eyebrow ? <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">{eyebrow}</p> : null}
        <h1 className="truncate text-[1.35rem] font-black tracking-[-0.025em]">{title}</h1>
      </div>
    </header>
  );
}

export function StoreLiteNotice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[10px] border border-emerald-200/80 bg-emerald-50 px-4 py-3 text-xs font-bold leading-5 text-emerald-800">{children}</div>;
}

// eslint-disable-next-line react-refresh/only-export-components -- Shared deterministic formatter has no React state.
export function formatStoreLiteDateTime(value: string, timezone = 'Asia/Shanghai') {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value));
  } catch {
    return value;
  }
}
