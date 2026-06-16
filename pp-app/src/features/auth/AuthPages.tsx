import { ArrowLeft, Camera, CheckCircle2, LogOut, MessageSquareText, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  getPostAuthHome,
  getRegisteredAccount,
  hasRegisteredAccount,
  isAccountLoggedIn,
  loginWithPhoneCode,
  logoutAccount,
  MissingRoleRegistrationError,
  registerWithPhone,
  requestPhoneCode,
  type RegisterInput,
} from '../../services/authService';

type PublicRole = RegisterInput['role'];

const roleOptions: Array<{ role: PublicRole; title: string; desc: string; icon: typeof UserRound }> = [
  { role: 'consumer', title: '创作者', desc: '发现作品、预约摄影师、管理成片', icon: UserRound },
  { role: 'companion', title: '摄影师', desc: '接单报价、管理档期、发布作品', icon: Camera },
];

export function EntryRedirect() {
  if (!hasRegisteredAccount()) return <Navigate to="/auth/register" replace />;
  if (!isAccountLoggedIn()) return <Navigate to="/auth/login" replace />;
  return <Navigate to={getPostAuthHome(getRegisteredAccount()?.role)} replace />;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!hasRegisteredAccount()) return <Navigate to="/auth/register" replace state={{ from: location.pathname }} />;
  if (!isAccountLoggedIn()) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function RequireRole({ role, fallback, children }: { role: PublicRole; fallback: string; children: React.ReactNode }) {
  const location = useLocation();
  if (!hasRegisteredAccount()) return <Navigate to="/auth/register" replace state={{ from: location.pathname }} />;
  if (!isAccountLoggedIn()) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  if (getRegisteredAccount()?.role !== role) return <Navigate to={fallback} replace />;
  return children;
}

export function GuestOnly({ children }: { children: React.ReactNode }) {
  if (isAccountLoggedIn()) return <Navigate to={getPostAuthHome(getRegisteredAccount()?.role)} replace />;
  return children;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const registerState = location.state as { role?: PublicRole; phone?: string } | null;
  const [role, setRole] = useState<PublicRole>(registerState?.role ?? 'consumer');
  const [phone, setPhone] = useState(registerState?.phone ?? '');
  const [code, setCode] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [error, setError] = useState('');

  function sendCode() {
    try {
      const nextCode = requestPhoneCode(phone);
      setDemoCode(nextCode);
      setError('');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  }

  async function submit() {
    try {
      registerWithPhone({ phone, code, role });
      await loginWithPhoneCode(phone, code, role);
      navigate(getRoleOnboardingPath(role), { replace: true });
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  }

  return (
    <AuthFrame eyebrow="首次使用 PP" title="选择身份并注册">
      <div className="grid grid-cols-2 gap-2">
        {roleOptions.map((item) => {
          const Icon = item.icon;
          const active = role === item.role;
          return (
            <button
              key={item.role}
              type="button"
              className={`min-h-28 rounded-[10px] px-3 py-3 text-left ring-1 transition ${
                active ? 'bg-zinc-950 text-white ring-zinc-950' : 'bg-white text-zinc-700 ring-zinc-200'
              }`}
              onClick={() => setRole(item.role)}
            >
              <Icon size={20} />
              <span className="mt-3 block text-base font-black">{item.title}</span>
              <span className={`mt-1 block text-xs leading-5 ${active ? 'text-white/62' : 'text-zinc-400'}`}>{item.desc}</span>
            </button>
          );
        })}
      </div>

      <PhoneCodeForm phone={phone} code={code} onPhoneChange={setPhone} onCodeChange={setCode} onSendCode={sendCode} demoCode={demoCode} />
      {error ? <ErrorLine text={error} /> : null}

      <button className="mt-5 h-12 w-full rounded-full bg-[#e85d75] text-sm font-black text-white" type="button" onClick={submit}>
        注册并进入登录
      </button>
      <Link className="mt-4 block text-center text-sm font-bold text-zinc-500" to="/auth/login">
        已有账号，去登录
      </Link>
    </AuthFrame>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const loginState = location.state as { role?: PublicRole; phone?: string } | null;
  const account = getRegisteredAccount();
  const [phone, setPhone] = useState(loginState?.phone ?? account?.phone ?? '');
  const [role, setRole] = useState<PublicRole>(loginState?.role ?? account?.role ?? 'consumer');
  const [code, setCode] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [error, setError] = useState('');
  const [missingRolePrompt, setMissingRolePrompt] = useState<{ role: PublicRole; phone: string } | null>(null);

  function sendCode() {
    try {
      const nextCode = requestPhoneCode(phone);
      setDemoCode(nextCode);
      setError('');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  }

  async function submit() {
    try {
      const session = await loginWithPhoneCode(phone, code, role);
      navigate(getPostAuthHome(session.role), { replace: true });
    } catch (nextError) {
      if (nextError instanceof MissingRoleRegistrationError) {
        setError('');
        setMissingRolePrompt({ role: nextError.role, phone });
        return;
      }
      setError(getErrorMessage(nextError));
    }
  }

  return (
    <AuthFrame eyebrow="欢迎回来" title="手机号验证码登录">
      {account ? (
        <div className="mb-4 flex items-center gap-3 rounded-[10px] bg-zinc-950 p-3 text-white">
          <CheckCircle2 size={18} className="text-emerald-300" />
          <span className="min-w-0 flex-1 text-sm font-bold">
            已注册 {account.roles.map((item) => (item === 'companion' ? '摄影师' : '创作者')).join(' / ')}
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {roleOptions.map((item) => {
          const Icon = item.icon;
          const active = role === item.role;
          return (
            <button
              key={item.role}
              type="button"
              className={`min-h-24 rounded-[10px] px-3 py-3 text-left ring-1 transition ${
                active ? 'bg-zinc-950 text-white ring-zinc-950' : 'bg-white text-zinc-700 ring-zinc-200'
              }`}
              onClick={() => {
                setRole(item.role);
                setMissingRolePrompt(null);
              }}
            >
              <Icon size={19} />
              <span className="mt-2 block text-base font-black">{item.title}</span>
              <span className={`mt-1 block text-xs leading-5 ${active ? 'text-white/62' : 'text-zinc-400'}`}>{item.desc}</span>
            </button>
          );
        })}
      </div>

      <PhoneCodeForm phone={phone} code={code} onPhoneChange={setPhone} onCodeChange={setCode} onSendCode={sendCode} demoCode={demoCode} />
      {error ? <ErrorLine text={error} /> : null}
      {missingRolePrompt ? (
        <MissingRoleRegisterDialog
          role={missingRolePrompt.role}
          phone={missingRolePrompt.phone}
          onClose={() => setMissingRolePrompt(null)}
          onRegister={() => {
            navigate('/auth/register', {
              state: { role: missingRolePrompt.role, phone: missingRolePrompt.phone },
            });
          }}
        />
      ) : null}

      <button className="mt-5 h-12 w-full rounded-full bg-zinc-950 text-sm font-black text-white" type="button" onClick={() => void submit()}>
        登录
      </button>
      <Link className="mt-4 block text-center text-sm font-bold text-zinc-500" to="/auth/register" state={{ role, phone }}>
        注册
      </Link>
    </AuthFrame>
  );
}

function MissingRoleRegisterDialog({
  role,
  phone,
  onClose,
  onRegister,
}: {
  role: PublicRole;
  phone: string;
  onClose: () => void;
  onRegister: () => void;
}) {
  const roleLabel = role === 'companion' ? '摄影师' : '创作者';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-5">
      <section className="w-full max-w-sm rounded-[18px] bg-white p-5 text-zinc-950 shadow-2xl">
        <p className="text-xs font-black text-[#e85d75]">该身份尚未注册</p>
        <h2 className="mt-2 text-xl font-black">注册成为{roleLabel}？</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-zinc-500">
          手机号 {phone || '当前手机号'} 还没有{roleLabel}身份。你可以关闭并留在登录页，或进入{roleLabel}注册流程。
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" className="h-11 rounded-full bg-zinc-100 text-sm font-black text-zinc-600" onClick={onClose}>
            关闭
          </button>
          <button type="button" className="h-11 rounded-full bg-zinc-950 text-sm font-black text-white" onClick={onRegister}>
            注册
          </button>
        </div>
      </section>
    </div>
  );
}

function getRoleOnboardingPath(role: PublicRole) {
  return role === 'companion' ? '/companion/onboarding' : '/consumer/onboarding';
}

export function AccountSettingsPage() {
  const navigate = useNavigate();
  const account = getRegisteredAccount();
  const roleLabel = account?.role === 'companion' ? '摄影师' : '创作者';

  async function logout() {
    await logoutAccount();
    navigate('/auth/login', { replace: true });
  }

  return (
    <div className="min-h-dvh bg-[#f7f7f5] px-4 pb-24 pt-4 text-zinc-950">
      <header className="flex items-center gap-3">
        <button className="grid h-10 w-10 place-items-center rounded-full bg-white text-zinc-800 ring-1 ring-zinc-200" type="button" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-xs font-black text-[#e85d75]">账号与安全</p>
          <h1 className="mt-0.5 text-2xl font-black">设置</h1>
        </div>
      </header>

      <section className="mt-5 rounded-[12px] bg-zinc-950 p-4 text-white">
        <p className="text-xs font-black text-white/46">当前账号</p>
        <h2 className="mt-2 text-xl font-black">{roleLabel}</h2>
        <p className="mt-1 text-sm font-semibold text-white/58">{account?.phone ?? '未绑定手机号'}</p>
      </section>

      <section className="mt-5 divide-y divide-zinc-100 rounded-[10px] border border-zinc-200 bg-white">
        <SettingRow icon={<Smartphone size={19} />} title="手机号" desc={account?.phone ?? '未绑定'} />
        <SettingRow icon={<ShieldCheck size={19} />} title="实名认证" desc="MVP 本地模拟，后续接入微信与平台审核" />
        <SettingRow icon={<MessageSquareText size={19} />} title="验证码登录" desc="当前使用本地 mock 验证码" />
      </section>

      <button
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-black text-rose-600 ring-1 ring-rose-100"
        type="button"
        onClick={() => void logout()}
      >
        <LogOut size={18} />
        退出账号
      </button>
    </div>
  );
}

function AuthFrame({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f7f7f5] px-5 py-8 text-zinc-950">
      <section className="mx-auto max-w-md">
        <div className="pt-8">
          <p className="text-sm font-black text-[#e85d75]">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-black tracking-normal">{title}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-zinc-500">用手机号验证码完成本地 MVP 登录，后续可平滑替换为微信手机号授权。</p>
        </div>
        <div className="mt-7 rounded-[16px] bg-white p-4 shadow-sm ring-1 ring-zinc-200">{children}</div>
      </section>
    </div>
  );
}

function PhoneCodeForm({
  phone,
  code,
  demoCode,
  onPhoneChange,
  onCodeChange,
  onSendCode,
}: {
  phone: string;
  code: string;
  demoCode: string;
  onPhoneChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSendCode: () => void;
}) {
  return (
    <div className="mt-5 space-y-3">
      <label className="block">
        <span className="text-xs font-black text-zinc-400">手机号</span>
        <input
          className="mt-1 h-12 w-full rounded-[10px] bg-zinc-100 px-3 text-base font-bold outline-none"
          inputMode="numeric"
          maxLength={11}
          placeholder="请输入手机号"
          value={phone}
          onChange={(event) => onPhoneChange(event.target.value.replace(/\D/g, '').slice(0, 11))}
        />
      </label>
      <label className="block">
        <span className="text-xs font-black text-zinc-400">验证码</span>
        <div className="mt-1 grid grid-cols-[1fr_108px] gap-2">
          <input
            className="h-12 rounded-[10px] bg-zinc-100 px-3 text-base font-bold outline-none"
            inputMode="numeric"
            maxLength={6}
            placeholder="6 位验证码"
            value={code}
            onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <button className="h-12 rounded-[10px] bg-zinc-950 text-xs font-black text-white" type="button" onClick={onSendCode}>
            获取验证码
          </button>
        </div>
      </label>
      {demoCode ? <p className="rounded-[10px] bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">本地测试验证码：{demoCode}</p> : null}
    </div>
  );
}

function SettingRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex min-h-16 items-center gap-3 px-4">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black">{title}</span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-zinc-400">{desc}</span>
      </span>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return <p className="mt-3 rounded-[10px] bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{text}</p>;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试';
}
