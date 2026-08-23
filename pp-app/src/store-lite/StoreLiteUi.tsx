import { AlertCircle, ArrowLeft, LoaderCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function StoreLiteLoading({ label }: { label: string }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
      <div>
        <LoaderCircle className="mx-auto animate-spin text-zinc-400" size={26} />
        <p className="mt-3 text-sm font-bold text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

export function StoreLiteError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-4 my-8 rounded-2xl border border-rose-100 bg-rose-50 p-5 text-center">
      <AlertCircle className="mx-auto text-rose-500" size={24} />
      <p className="mt-3 text-sm font-bold leading-6 text-rose-700">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-rose-600 px-5 text-sm font-black text-white">
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
    <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-zinc-200/70 bg-[#f6f5f1]/94 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      {back ? (
        <button type="button" onClick={() => navigate(-1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white ring-1 ring-zinc-200" aria-label="返回">
          <ArrowLeft size={20} />
        </button>
      ) : null}
      <div className="min-w-0 py-3">
        {eyebrow ? <p className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-400">{eyebrow}</p> : null}
        <h1 className="truncate text-xl font-black tracking-tight">{title}</h1>
      </div>
    </header>
  );
}

export function StoreLiteNotice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-900">{children}</div>;
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
