import { AlertTriangle, LoaderCircle, RefreshCw } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function AdminError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 shrink-0" size={16} />
        <p className="m-0 flex-1 font-semibold leading-5">{message}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="shrink-0 font-black underline underline-offset-4">
            重试
          </button>
        ) : null}
      </div>
    </div>
  );
}
export function AdminLoading({ label = '正在加载' }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-2 text-sm font-bold text-zinc-500" role="status">
      <LoaderCircle className="animate-spin" size={18} />
      {label}
    </div>
  );
}

export function AdminEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center px-6 text-center">
      <p className="m-0 text-base font-black text-zinc-700">{title}</p>
      <p className="mt-2 max-w-sm text-sm font-semibold leading-6 text-zinc-400">{description}</p>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-zinc-600">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11px] font-semibold leading-4 text-zinc-400">{hint}</span> : null}
    </label>
  );
}

export function DetailRow({ label, children, sensitive = false }: { label: string; children: ReactNode; sensitive?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${sensitive ? 'border-amber-200 bg-amber-50' : 'border-zinc-200 bg-zinc-50'}`}>
      <p className={`m-0 text-[11px] font-black uppercase tracking-wide ${sensitive ? 'text-amber-700' : 'text-zinc-400'}`}>{label}</p>
      <div className="mt-1 break-words text-sm font-bold leading-6 text-zinc-800">{children}</div>
    </div>
  );
}

export function StatusBadge({ label, tone }: { label: string; tone: 'amber' | 'green' | 'red' | 'gray' | 'blue' }) {
  const classes = {
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    red: 'bg-rose-50 text-rose-800 ring-rose-200',
    gray: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
    blue: 'bg-blue-50 text-blue-800 ring-blue-200',
  }[tone];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${classes}`}>{label}</span>;
}

export function ActionButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-10 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-zinc-300 ${className}`}
    />
  );
}

export function SecondaryButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-black text-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-300 ${className}`}
    />
  );
}

export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <SecondaryButton type="button" onClick={onClick} disabled={loading} aria-label="刷新队列">
      <RefreshCw className={loading ? 'animate-spin' : ''} size={15} />
      刷新
    </SecondaryButton>
  );
}

export function ActionSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
      <h3 className="m-0 text-sm font-black text-zinc-900">{title}</h3>
      {description ? <p className="mt-1 text-xs font-semibold leading-5 text-zinc-500">{description}</p> : null}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

export function QueueLayout({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  return <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(360px,0.85fr)_minmax(520px,1.15fr)]">{list}{detail}</div>;
}
