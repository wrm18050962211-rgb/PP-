import { Ban, CalendarDays, Check, ChevronRight, FileText, Flag, Headphones, LogIn, LogOut, Settings, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStoreLiteAuth } from '../StoreLiteAuth';
import { StoreLiteError, StoreLiteLoading } from '../StoreLiteUi';

const privacyUrl = String(import.meta.env.VITE_PRIVACY_URL ?? '').trim();
const termsUrl = String(import.meta.env.VITE_TERMS_URL ?? '').trim();
const supportUrl = String(import.meta.env.VITE_SUPPORT_URL ?? '').trim();

export function StoreLiteLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading, requestCode, login } = useStoreLiteAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const destination = readReturnPath(location.state);

  useEffect(() => {
    if (session) navigate(destination, { replace: true });
  }, [destination, navigate, session]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function sendCode() {
    if (!agreed) {
      setError('请先阅读并同意隐私政策和用户协议');
      return;
    }
    if (sending || cooldown > 0) return;
    setSending(true);
    try {
      const result = await requestCode(phone);
      setCooldown(result.cooldownSeconds);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '验证码发送失败');
    } finally {
      setSending(false);
    }
  }

  async function submit() {
    if (!agreed) {
      setError('请先阅读并同意隐私政策和用户协议');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await login(phone, code);
      navigate(destination, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <StoreLiteLoading label="正在确认登录状态" />;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-[#050505] px-5 pb-10 pt-[calc(env(safe-area-inset-top)+2.5rem)] text-white">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-white/42"><ShieldCheck size={15} />Still</div>
      <h1 className="mt-5 text-[2rem] font-black tracking-[-0.045em]">登录 Still</h1>
      <p className="mt-3 text-sm font-semibold leading-6 text-white/55">手机号验证后即可浏览、提交预约申请，并在不同设备查看处理状态。</p>
      <div className="mt-7 space-y-4 rounded-[18px] bg-white p-5 text-zinc-950 shadow-[0_24px_70px_rgba(0,0,0,0.36)]">
        <label className="block"><span className="mb-2 block text-xs font-black text-zinc-500">手机号</span><input inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="11 位手机号" className="store-lite-input" /></label>
        <label className="block"><span className="mb-2 block text-xs font-black text-zinc-500">短信验证码</span><span className="flex gap-2"><input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 位验证码" className="store-lite-input min-w-0 flex-1" /><button type="button" disabled={!agreed || sending || cooldown > 0} onClick={() => void sendCode()} className="w-28 shrink-0 rounded-xl bg-zinc-100 text-xs font-black text-zinc-700 disabled:text-zinc-400">{cooldown > 0 ? `${cooldown}s` : sending ? '发送中' : '获取验证码'}</button></span></label>
        <button type="button" onClick={() => setAgreed((value) => !value)} className="flex items-start gap-3 text-left">
          <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md ring-1 ${agreed ? 'bg-zinc-950 text-white ring-zinc-950' : 'bg-white text-transparent ring-zinc-300'}`}><Check size={13} /></span>
          <span className="text-xs font-semibold leading-5 text-zinc-500">我已阅读并同意 <LegalLink href={privacyUrl} label="隐私政策" /> 和 <LegalLink href={termsUrl} label="用户协议" />。</span>
        </button>
        {error ? <StoreLiteError message={error} /> : null}
        <button type="button" disabled={submitting} onClick={() => void submit()} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-black text-white disabled:bg-zinc-300"><LogIn size={17} />{submitting ? '验证中' : '验证并继续'}</button>
      </div>
      <button type="button" onClick={() => navigate(-1)} className="mx-auto mt-6 block text-sm font-bold text-white/55">暂不登录，返回浏览</button>
    </main>
  );
}

export function StoreLiteAccountPage() {
  const navigate = useNavigate();
  const { session, loading, error, logout } = useStoreLiteAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  if (loading) return <StoreLiteLoading label="正在加载账号" />;
  if (!session) {
    return (
      <div className="px-4 pb-5 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <section className="rounded-[10px] bg-zinc-950 p-5 text-white"><UserRound size={30} /><h1 className="mt-5 text-2xl font-black">登录后管理预约</h1><p className="mt-2 text-sm font-semibold leading-6 text-white/58">手机号验证后可在不同设备查看同一份预约状态。</p><Link to="/login" className="mt-5 flex h-11 items-center justify-center rounded-full bg-white text-sm font-black text-zinc-950">登录 / 注册</Link></section>
          <LegalRows />
      </div>
    );
  }

  async function doLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      navigate('/', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="space-y-5 px-4 pb-5 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <section className="rounded-[10px] bg-zinc-950 p-4 text-white">
          <div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-full bg-white/12"><UserRound size={24} /></span><div className="min-w-0 flex-1"><p className="text-xs font-black text-white/44">Still 账号</p><p className="mt-0.5 truncate text-xl font-black">{session.user.nickname || 'Still 用户'}</p><p className="mt-1 text-xs font-semibold text-white/54">{maskPhone(session.user.phone)}</p></div><ChevronRight size={21} className="text-white/36" /></div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <AccountQuickLink to="/bookings" icon={CalendarDays} label="我的预约" />
            <AccountQuickLink to="/compliance/reports" icon={Flag} label="我的举报" />
            <AccountQuickLink to="/compliance/blocked" icon={Ban} label="屏蔽管理" />
          </div>
        </section>
        {error ? <StoreLiteError message={error} /> : null}
        <section className="overflow-hidden rounded-[10px] bg-white ring-1 ring-zinc-200">
          <AccountRow to="/bookings" icon={CalendarDays} title="我的预约" description="查看确认、拒绝和取消状态" />
          <AccountRow to="/compliance" icon={Settings} title="设置与安全" description="客服、举报、个人数据与账号删除" />
          <ExternalRow href={supportUrl} icon={Headphones} title="帮助与客服" description="预约、内容安全与账号问题" />
        </section>
        <LegalRows />
        <button type="button" onClick={() => void doLogout()} disabled={loggingOut} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-black text-rose-600 ring-1 ring-rose-200"><LogOut size={17} />{loggingOut ? '退出中' : '退出登录'}</button>
    </div>
  );
}

function AccountQuickLink({ to, icon: Icon, label }: { to: string; icon: typeof CalendarDays; label: string }) {
  return <Link to={to} className="rounded-[8px] bg-white/[0.07] px-2 py-3 text-center active:bg-white/[0.11]"><Icon size={16} className="mx-auto text-white/58" /><span className="mt-1 block text-xs font-black leading-5">{label}</span></Link>;
}

function LegalRows() {
  return <section className="mt-5 overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200"><ExternalRow href={supportUrl} icon={Headphones} title="公开客服" description="无需登录即可联系平台" /><ExternalRow href={privacyUrl} icon={ShieldCheck} title="隐私政策" description="了解手机号和预约数据的处理方式" /><ExternalRow href={termsUrl} icon={FileText} title="用户协议" description="了解 Store Lite 预约申请规则" /></section>;
}

function AccountRow({ to, icon: Icon, title, description }: { to: string; icon: typeof CalendarDays; title: string; description: string }) {
  return <Link to={to} className="flex min-h-17 items-center gap-3 border-b border-zinc-100 px-4 last:border-0"><span className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100"><Icon size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black">{title}</span><span className="mt-1 block truncate text-xs font-semibold text-zinc-400">{description}</span></span><ChevronRight size={17} className="text-zinc-300" /></Link>;
}

function ExternalRow({ href, icon: Icon, title, description }: { href: string; icon: typeof Smartphone; title: string; description: string }) {
  return <a href={href || undefined} target="_blank" rel="noreferrer" aria-disabled={!href} className={`flex min-h-17 items-center gap-3 border-b border-zinc-100 px-4 last:border-0 ${href ? '' : 'pointer-events-none opacity-45'}`}><span className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100"><Icon size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black">{title}</span><span className="mt-1 block truncate text-xs font-semibold text-zinc-400">{description}</span></span><ChevronRight size={17} className="text-zinc-300" /></a>;
}

function LegalLink({ href, label }: { href: string; label: string }) {
  return href ? <a href={href} target="_blank" rel="noreferrer" className="font-black text-zinc-950" onClick={(event) => event.stopPropagation()}>{label}</a> : <span className="font-black text-zinc-950">{label}</span>;
}

function maskPhone(phone?: string) {
  const value = String(phone || '').replace(/\D/g, '');
  return /^1\d{10}$/.test(value) ? `${value.slice(0, 3)}****${value.slice(-4)}` : '已验证手机号';
}

function readReturnPath(state: unknown) {
  const from = state && typeof state === 'object' ? String((state as { from?: unknown }).from ?? '') : '';
  return from.startsWith('/') && !from.startsWith('//') ? from : '/bookings';
}
