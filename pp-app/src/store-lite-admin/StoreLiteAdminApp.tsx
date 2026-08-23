import { CalendarDays, FileWarning, LogOut, ShieldCheck, UserRoundCog } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AuthSession } from '../types/api';
import { AdminError } from './AdminUi';
import { BookingQueue } from './BookingQueue';
import { ContentReportQueue } from './ContentReportQueue';
import { UserRequestQueue } from './UserRequestQueue';
import { adminAuthExpiredEvent, adminErrorMessage, hasAdminToken } from './adminHttp';
import { loginAdmin, logoutAdmin, restoreAdminSession } from './storeLiteAdminApi';

type QueueKey = 'bookings' | 'user-requests' | 'content-reports';

const queueDefinitions = [
  { key: 'bookings' as const, label: '预约申请', readScope: 'booking_requests:read', icon: CalendarDays },
  { key: 'user-requests' as const, label: '客服与数据权利', readScope: 'user_requests:read', icon: UserRoundCog },
  { key: 'content-reports' as const, label: '内容举报', readScope: 'content_reports:read', icon: FileWarning },
];

export function StoreLiteAdminApp() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(() => hasAdminToken());
  const [authError, setAuthError] = useState('');

  async function refreshSession() {
    if (!hasAdminToken()) return;
    setLoading(true);
    try {
      setSession(await restoreAdminSession());
      setAuthError('');
    } catch (cause) {
      setSession(null);
      setAuthError(adminErrorMessage(cause, '运营会话恢复失败'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasAdminToken()) return;
    let active = true;
    void restoreAdminSession()
      .then((nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setAuthError('');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setSession(null);
        setAuthError(adminErrorMessage(cause, '运营会话恢复失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const expire = () => {
      setSession(null);
      setAuthError('登录已失效，请重新登录');
      setLoading(false);
    };
    window.addEventListener(adminAuthExpiredEvent, expire);
    return () => window.removeEventListener(adminAuthExpiredEvent, expire);
  }, []);

  if (loading) return <FullPageLoading />;
  if (!session) {
    return (
      <LoginScreen
        initialError={authError}
        canRetrySession={hasAdminToken()}
        onRetrySession={() => void refreshSession()}
        onLogin={(nextSession) => {
          setSession(nextSession);
          setAuthError('');
        }}
      />
    );
  }

  return (
    <OperationsWorkspace
      session={session}
      onLogout={async () => {
        try {
          await logoutAdmin();
          setAuthError('');
        } catch (cause) {
          setAuthError(`本机会话已清除；${adminErrorMessage(cause, '服务端登出失败')}`);
        } finally {
          setSession(null);
        }
      }}
    />
  );
}

function LoginScreen({
  initialError,
  canRetrySession,
  onRetrySession,
  onLogin,
}: {
  initialError: string;
  canRetrySession: boolean;
  onRetrySession: () => void;
  onLogin: (session: AuthSession) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      onLogin(await loginAdmin(username, password));
      setPassword('');
    } catch (cause) {
      setError(adminErrorMessage(cause, '登录失败，请稍后重试'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 py-10">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl shadow-black/30">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-950 text-white"><ShieldCheck size={22} /></div>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-zinc-400">Store Lite operations</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-950">Still 运营台</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-zinc-500">仅限获授权运营人员。登录凭据不会写入浏览器持久存储。</p>

        <form className="mt-7 space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-zinc-600">用户名</span>
            <input className="admin-input" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={120} autoComplete="username" required />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-zinc-600">密码</span>
            <input className="admin-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} maxLength={256} autoComplete="current-password" required />
          </label>
          {error || initialError ? <AdminError message={error || initialError} /> : null}
          {canRetrySession ? (
            <button type="button" onClick={onRetrySession} className="text-xs font-black text-zinc-600 underline underline-offset-4">重试恢复本次会话</button>
          ) : null}
          <button type="submit" disabled={submitting} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-zinc-950 text-sm font-black text-white disabled:bg-zinc-300">
            {submitting ? '正在验证' : '登录运营台'}
          </button>
        </form>
        <p className="mt-5 text-xs font-semibold leading-5 text-zinc-400">Token 仅保存在内存与本次标签页的 sessionStorage；关闭标签页后不会继续保留。</p>
      </section>
    </main>
  );
}

function FullPageLoading() {
  return <main className="grid min-h-dvh place-items-center bg-zinc-950 text-sm font-black text-white">正在恢复安全会话…</main>;
}

function OperationsWorkspace({ session, onLogout }: { session: AuthSession; onLogout: () => Promise<void> }) {
  const scopes = useMemo(() => new Set(session.adminScope ?? []), [session.adminScope]);
  const availableQueues = queueDefinitions.filter((item) => scopes.has(item.readScope));
  const [activeQueue, setActiveQueue] = useState<QueueKey>(() => availableQueues[0]?.key ?? 'bookings');
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main className="min-h-dvh bg-zinc-100 text-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-950 text-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300">Still Store Lite</p>
            <h1 className="mt-1 text-xl font-black">运营处理台</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right"><p className="m-0 text-sm font-black">{session.user.nickname || '运营人员'}</p><p className="mt-0.5 text-[11px] font-semibold text-zinc-400">{session.adminScope?.length ?? 0} 项有效权限</p></div>
            <button type="button" disabled={loggingOut} onClick={() => void logout()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-700 px-3 text-xs font-black text-white disabled:text-zinc-500"><LogOut size={15} />{loggingOut ? '退出中' : '退出'}</button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100dvh-74px)] max-w-[1500px] flex-col px-4 py-5 sm:px-6">
        {availableQueues.length ? (
          <>
            <nav className="mb-4 flex flex-wrap gap-2" aria-label="运营队列">
              {availableQueues.map((item) => {
                const Icon = item.icon;
                const active = activeQueue === item.key;
                return <button key={item.key} type="button" onClick={() => setActiveQueue(item.key)} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-black ${active ? 'bg-zinc-950 text-white' : 'border border-zinc-200 bg-white text-zinc-600'}`}><Icon size={16} />{item.label}</button>;
              })}
            </nav>
            {activeQueue === 'bookings' ? <BookingQueue canWrite={scopes.has('booking_requests:write')} /> : null}
            {activeQueue === 'user-requests' ? <UserRequestQueue canWrite={scopes.has('user_requests:write')} /> : null}
            {activeQueue === 'content-reports' ? <ContentReportQueue canModerate={scopes.has('content_reports:moderate')} /> : null}
          </>
        ) : (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6"><h2 className="m-0 text-lg font-black text-amber-900">当前账号没有 Store Lite 读取权限</h2><p className="mt-2 text-sm font-semibold leading-6 text-amber-800">请联系管理员分配预约、用户请求或内容举报的读取 scope。运营台不会在客户端扩大权限。</p></section>
        )}
      </div>
    </main>
  );
}
