import { ArrowLeft, Camera, CheckCircle2, FileText, Headphones, LogOut, MessageSquareText, ShieldAlert, ShieldCheck, Smartphone, Trash2, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  accountHasRole,
  getActiveAuthRole,
  getActivePublicRole,
  getAvailableLoginRoles,
  getPostAuthHome,
  getRegisteredAccount,
  hasRegisteredAccount,
  isAccountLoggedIn,
  loginWithPhoneCode,
  logoutAccount,
  MissingRoleRegistrationError,
  PendingRoleReviewError,
  registerWithPhone,
  requestPhoneCode,
  type RegisterInput,
} from '../../services/authService';
import { submitAccountDeletionRequest } from '../../services/accountDeletionService';
import { isTestRoleSwitchAllowed } from '../../services/apiClient';
import { submitSupportRequest, supportRequestCategoryOptions, type SupportRequestCategory } from '../../services/supportRequestService';

type PublicRole = RegisterInput['role'];

function toPublicRole(value: unknown): PublicRole | null {
  return value === 'consumer' || value === 'companion' ? value : null;
}

function getRegisterPath(role: PublicRole, phone?: string) {
  const params = new URLSearchParams({ role });
  if (phone) params.set('phone', phone);
  return `/auth/register?${params.toString()}`;
}

const roleOptions: Array<{ role: PublicRole; title: string; desc: string; icon: typeof UserRound }> = [
  { role: 'consumer', title: 'Client', desc: '预约拍摄，管理成片', icon: UserRound },
  { role: 'companion', title: 'Studio', desc: '接单报价，管理交付', icon: Camera },
];
const localSmsCodeLabel = import.meta.env.PROD ? '' : '本地测试验证码：';

export function EntryRedirect() {
  if (!hasRegisteredAccount()) return <Navigate to="/auth/register" replace />;
  if (!isAccountLoggedIn()) return <Navigate to="/auth/login" replace />;
  return <Navigate to={getPostAuthHome(getActiveAuthRole())} replace />;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!hasRegisteredAccount()) return <Navigate to="/auth/register" replace state={{ from: location.pathname }} />;
  if (!isAccountLoggedIn()) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function RequireRole({ role, fallback, children }: { role: PublicRole; fallback: string; children: React.ReactNode }) {
  const location = useLocation();
  const account = getRegisteredAccount();
  const activeRole = getActiveAuthRole();
  if (!hasRegisteredAccount()) return <Navigate to="/auth/register" replace state={{ from: location.pathname }} />;
  if (!isAccountLoggedIn()) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  if (activeRole !== role || !accountHasRole(role)) return <Navigate to={getPostAuthHome(activeRole) || fallback} replace />;
  return children;
}

export function RequireUserSettings({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const activeRole = getActivePublicRole();
  if (getActiveAuthRole() === 'admin') return <Navigate to="/admin" replace />;
  if (!hasRegisteredAccount()) return <Navigate to="/auth/register" replace state={{ from: location.pathname }} />;
  if (!isAccountLoggedIn()) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  if (!activeRole || !accountHasRole(activeRole)) return <Navigate to={getPostAuthHome(activeRole ?? 'consumer')} replace />;
  return children;
}

export function RequireRegistrationDraft({ role, children }: { role: PublicRole; children: React.ReactNode }) {
  const account = getRegisteredAccount();
  if (!account) return <Navigate to="/auth/register" replace state={{ role }} />;
  if (account.role !== role) return <Navigate to="/auth/register" replace state={{ role }} />;
  if (accountHasRole(role)) return <Navigate to={getPostAuthHome(role)} replace />;
  return children;
}

export function GuestOnly({ children }: { children: React.ReactNode }) {
  if (isAccountLoggedIn()) return <Navigate to={getPostAuthHome(getActiveAuthRole())} replace />;
  return children;
}

export function RegisterPage() {
  const location = useLocation();
  const registerState = location.state as { role?: PublicRole; phone?: string } | null;
  const registerParams = new URLSearchParams(location.search);
  const initialRole = toPublicRole(registerState?.role) ?? toPublicRole(registerParams.get('role')) ?? 'consumer';
  const initialPhone = registerState?.phone ?? registerParams.get('phone') ?? '';

  return <RegisterForm key={`${initialRole}:${initialPhone}`} initialRole={initialRole} initialPhone={initialPhone} />;
}

function RegisterForm({ initialRole, initialPhone }: { initialRole: PublicRole; initialPhone: string }) {
  const navigate = useNavigate();
  const [role, setRole] = useState<PublicRole>(initialRole);
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [error, setError] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const showTestCode = isTestRoleSwitchAllowed();

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setTimeout(() => setCooldownSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  async function sendCode() {
    if (sendingCode || cooldownSeconds > 0) return;
    setSendingCode(true);
    try {
      const result = await requestPhoneCode(phone);
      setDemoCode(result.testCode || '');
      setCooldownSeconds(result.cooldownSeconds);
      setError('');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setSendingCode(false);
    }
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const account = await registerWithPhone({ phone, code, role });
      navigate(accountHasRole(role) ? getPostAuthHome(role) : getRoleOnboardingPath(role), { replace: true, state: { role, phone: account.phone } });
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame eyebrow="首次使用 Still" title="选择入口并注册">
      <div className="grid grid-cols-2 gap-2">
        {roleOptions.map((item) => {
          const Icon = item.icon;
          const active = role === item.role;
          return (
            <button
              key={item.role}
              type="button"
              className={`min-h-28 rounded-[8px] px-3 py-3 text-left ring-1 transition ${
                active ? 'bg-black text-white ring-black' : 'bg-zinc-50 text-zinc-800 ring-zinc-200 hover:bg-zinc-100'
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

      <PhoneCodeForm
        phone={phone}
        code={code}
        onPhoneChange={setPhone}
        onCodeChange={setCode}
        onSendCode={sendCode}
        demoCode={demoCode}
        showTestCode={showTestCode}
        sendingCode={sendingCode}
        cooldownSeconds={cooldownSeconds}
      />
      {error ? <ErrorLine text={error} /> : null}

      <button className="mt-5 h-12 w-full rounded-full bg-zinc-950 text-sm font-black text-white disabled:bg-zinc-300" type="button" onClick={() => void submit()} disabled={submitting}>
        {submitting ? '提交中' : '注册账号'}
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
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const registeredRoles = getAvailableLoginRoles(phone || account?.phone);
  const showTestCode = isTestRoleSwitchAllowed();

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setTimeout(() => setCooldownSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  async function sendCode() {
    if (sendingCode || cooldownSeconds > 0) return;
    setSendingCode(true);
    try {
      const result = await requestPhoneCode(phone);
      setDemoCode(result.testCode || '');
      setCooldownSeconds(result.cooldownSeconds);
      setError('');
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setSendingCode(false);
    }
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const session = await loginWithPhoneCode(phone, code, role);
      navigate(getPostAuthHome(session.role), { replace: true });
    } catch (nextError) {
      if (nextError instanceof PendingRoleReviewError) {
        setMissingRolePrompt(null);
        setError(nextError.message);
        return;
      }
      if (nextError instanceof MissingRoleRegistrationError) {
        setError('');
        setMissingRolePrompt({ role: nextError.role, phone });
        return;
      }
      setError(getErrorMessage(nextError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame eyebrow="欢迎回来" title="手机号验证码登录">
      {registeredRoles.length ? (
        <div className="mb-4 flex items-center gap-3 rounded-[10px] bg-zinc-950 p-3 text-white">
          <CheckCircle2 size={18} className="text-emerald-300" />
          <span className="min-w-0 flex-1 text-sm font-bold">
            已注册 {registeredRoles.map(getPublicRoleLabel).join(' / ')}
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
              className={`min-h-24 rounded-[8px] px-3 py-3 text-left ring-1 transition ${
                active ? 'bg-black text-white ring-black' : 'bg-zinc-50 text-zinc-800 ring-zinc-200 hover:bg-zinc-100'
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

      <PhoneCodeForm
        phone={phone}
        code={code}
        onPhoneChange={setPhone}
        onCodeChange={setCode}
        onSendCode={sendCode}
        demoCode={demoCode}
        showTestCode={showTestCode}
        sendingCode={sendingCode}
        cooldownSeconds={cooldownSeconds}
      />
      {error ? <ErrorLine text={error} /> : null}
      {missingRolePrompt ? (
        <MissingRoleRegisterDialog
          role={missingRolePrompt.role}
          phone={missingRolePrompt.phone}
          onClose={() => setMissingRolePrompt(null)}
          onRegister={() => {
            navigate(getRegisterPath(missingRolePrompt.role, missingRolePrompt.phone), {
              replace: true,
              state: { role: missingRolePrompt.role, phone: missingRolePrompt.phone },
            });
          }}
        />
      ) : null}

      <button className="mt-5 h-12 w-full rounded-full bg-zinc-950 text-sm font-black text-white disabled:bg-zinc-300" type="button" onClick={() => void submit()} disabled={submitting}>
        {submitting ? '登录中' : '登录'}
      </button>
      <button
        className="mt-4 block w-full text-center text-sm font-bold text-zinc-500"
        type="button"
        onClick={() => {
          setMissingRolePrompt(null);
          navigate(getRegisterPath(role, phone), { replace: true, state: { role, phone } });
        }}
      >
        注册
      </button>
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
  const roleLabel = getPublicRoleLabel(role);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-5">
      <section className="w-full max-w-sm rounded-[18px] bg-white p-5 text-zinc-950 shadow-2xl">
        <p className="text-xs font-black text-zinc-500">该身份尚未注册</p>
        <h2 className="mt-2 text-xl font-black">注册 {roleLabel}？</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-zinc-500">
          手机号 {phone || '当前手机号'} 还没有 {roleLabel} 身份。你可以关闭并留在登录页，或进入 {roleLabel} 注册流程。
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
  const activeRole = getActivePublicRole() ?? account?.role ?? 'consumer';
  const roleLabel = getPublicRoleLabel(activeRole);
  const [activeComplianceItem, setActiveComplianceItem] = useState<ComplianceItem | null>(null);
  const [deletionSubmitted, setDeletionSubmitted] = useState(false);
  const [supportSheetOpen, setSupportSheetOpen] = useState(false);
  const [supportSubmitted, setSupportSubmitted] = useState(false);

  async function logout() {
    await logoutAccount();
    navigate('/auth/login', { replace: true });
  }

  return (
    <div className="min-h-dvh bg-[#f7f7f5] px-4 pb-24 pt-4 text-zinc-950">
      <header className="flex items-center gap-3">
        <button className="grid h-10 w-10 place-items-center rounded-full bg-white text-zinc-800 ring-1 ring-zinc-200" type="button" onClick={() => navigate(getPostAuthHome(activeRole), { replace: true })} aria-label="返回">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-xs font-black text-zinc-500">账号与安全</p>
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
        <SettingRow icon={<ShieldCheck size={19} />} title="实名认证" desc="用于账号安全、服务履约与平台审核" />
        <SettingRow icon={<MessageSquareText size={19} />} title="验证码登录" desc="用于手机号登录与账号安全验证" />
      </section>

      <section className="mt-5">
        <p className="px-1 text-xs font-black text-zinc-400">平台与合规</p>
        <div className="mt-2 divide-y divide-zinc-100 rounded-[10px] border border-zinc-200 bg-white">
          {complianceItems.map(({ icon: Icon, ...item }) => (
            <button
              key={item.title}
              className="flex min-h-16 w-full items-center gap-3 px-4 text-left"
              type="button"
              onClick={() => {
                setDeletionSubmitted(false);
                setActiveComplianceItem({ icon: Icon, ...item });
              }}
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700">
                <Icon size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black">{item.title}</span>
                <span className="mt-0.5 block truncate text-xs font-semibold text-zinc-400">{item.desc}</span>
              </span>
            </button>
          ))}
          <button
            className="flex min-h-16 w-full items-center gap-3 px-4 text-left"
            type="button"
            onClick={() => {
              setSupportSubmitted(false);
              setSupportSheetOpen(true);
            }}
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700">
              <Headphones size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black">联系客服</span>
              <span className="mt-0.5 block truncate text-xs font-semibold text-zinc-400">订单、退款、举报与账号问题</span>
            </span>
          </button>
        </div>
      </section>

      <button
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-black text-rose-600 ring-1 ring-rose-100"
        type="button"
        onClick={() => void logout()}
      >
        <LogOut size={18} />
        退出账号
      </button>

      {activeComplianceItem ? (
        <ComplianceSheet
          item={activeComplianceItem}
          deletionSubmitted={deletionSubmitted}
          onClose={() => setActiveComplianceItem(null)}
          onSubmitDeletion={() => {
            if (!account) return;
            submitAccountDeletionRequest({
              phone: account.phone,
              role: activeRole,
              displayName: roleLabel,
            });
            setDeletionSubmitted(true);
          }}
        />
      ) : null}
      {supportSheetOpen ? (
        <SupportSheet
          account={account}
          roleLabel={roleLabel}
          submitted={supportSubmitted}
          onClose={() => setSupportSheetOpen(false)}
          onSubmit={(category, description) => {
            if (!account) return;
            submitSupportRequest({
              phone: account.phone,
              role: activeRole,
              displayName: roleLabel,
              category,
              description,
            });
            setSupportSubmitted(true);
          }}
        />
      ) : null}
    </div>
  );
}

function AuthFrame({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#050505] px-5 py-8 text-white">
      <section className="mx-auto max-w-md">
        <div className="pt-8">
          <p className="text-sm font-black text-white/45">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-black tracking-normal">{title}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-white/52">用手机号验证码进入 Still，后续可平滑替换为微信手机号授权。</p>
        </div>
        <div className="mt-7 rounded-[8px] bg-white p-4 text-zinc-950 shadow-2xl ring-1 ring-white/10">{children}</div>
      </section>
    </div>
  );
}

function PhoneCodeForm({
  phone,
  code,
  demoCode,
  showTestCode,
  sendingCode,
  cooldownSeconds,
  onPhoneChange,
  onCodeChange,
  onSendCode,
}: {
  phone: string;
  code: string;
  demoCode: string;
  showTestCode: boolean;
  sendingCode: boolean;
  cooldownSeconds: number;
  onPhoneChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSendCode: () => void | Promise<void>;
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
          <button
            className="h-12 rounded-[10px] bg-zinc-950 px-2 text-xs font-black text-white disabled:bg-zinc-300"
            type="button"
            onClick={() => void onSendCode()}
            disabled={sendingCode || cooldownSeconds > 0}
          >
            {sendingCode ? '发送中' : cooldownSeconds > 0 ? `${cooldownSeconds}s` : '获取验证码'}
          </button>
        </div>
      </label>
      {showTestCode && demoCode ? <p className="rounded-[10px] bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{localSmsCodeLabel}{demoCode}</p> : null}
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

type ComplianceItem = {
  icon: typeof FileText;
  title: string;
  desc: string;
  body: string;
  action?: 'delete-account';
};

const complianceItems: ComplianceItem[] = [
  {
    icon: FileText,
    title: '隐私政策',
    desc: '数据收集、定位、订单与聊天说明',
    body: 'Still 只在注册、预约、支付、沟通、举报和安全风控所需范围内使用信息。定位能力只在你主动选择附近摄影师或拍摄地点时触发，拒绝定位后仍可手动填写地点。',
  },
  {
    icon: ShieldCheck,
    title: '用户协议',
    desc: '平台交易、沟通和履约规则',
    body: '请在平台内完成咨询、报价、支付和订单沟通。禁止诱导私下交易、骚扰、虚假样片、冒用身份或发布违法违规内容。',
  },
  {
    icon: MessageSquareText,
    title: '支付与退款',
    desc: '线下摄影服务预约说明',
    body: '支付用于线下摄影服务预约，不属于数字内容购买。取消、退款和争议先由平台人工处理，后台会记录订单状态和处理结果。',
  },
  {
    icon: ShieldAlert,
    title: '举报与投诉',
    desc: '举报用户、内容或订单沟通',
    body: '你可以在聊天页或订单沟通中发起举报。平台会优先复核涉及私下交易、骚扰、爽约、样片不实和退款争议的记录。',
  },
  {
    icon: Trash2,
    title: '删除账号',
    desc: '提交账号删除申请',
    body: '当前版本先通过人工客服处理删除账号申请。正式上线前会接入可追踪的账号删除申请记录，并按隐私政策处理订单、聊天和审核留痕。',
    action: 'delete-account',
  },
];

function ComplianceSheet({
  item,
  deletionSubmitted,
  onClose,
  onSubmitDeletion,
}: {
  item: ComplianceItem;
  deletionSubmitted: boolean;
  onClose: () => void;
  onSubmitDeletion: () => void;
}) {
  const Icon = item.icon;
  const isDeleteAction = item.action === 'delete-account';

  function handlePrimaryAction() {
    if (!isDeleteAction || deletionSubmitted) {
      onClose();
      return;
    }
    onSubmitDeletion();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]" role="dialog" aria-modal="true">
      <section className="w-full max-w-md rounded-[12px] bg-white p-4 text-zinc-950 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-800">
            <Icon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-zinc-400">{item.desc}</p>
            <h2 className="mt-1 text-xl font-black">{item.title}</h2>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700" type="button" onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </div>
        <p className="mt-4 text-sm font-semibold leading-6 text-zinc-500">{item.body}</p>
        {deletionSubmitted ? (
          <p className="mt-4 rounded-[10px] bg-emerald-50 px-3 py-2 text-xs font-black leading-5 text-emerald-700">
            删除账号申请已提交，后台可在账号状态中处理。
          </p>
        ) : null}
        <button
          className={`mt-5 h-11 w-full rounded-full text-sm font-black ${
            isDeleteAction && !deletionSubmitted ? 'bg-rose-600 text-white' : 'bg-zinc-950 text-white'
          }`}
          type="button"
          onClick={handlePrimaryAction}
        >
          {isDeleteAction && !deletionSubmitted ? '提交删除申请' : '我知道了'}
        </button>
      </section>
    </div>
  );
}

function SupportSheet({
  account,
  roleLabel,
  submitted,
  onClose,
  onSubmit,
}: {
  account: { phone: string; role: PublicRole } | null;
  roleLabel: string;
  submitted: boolean;
  onClose: () => void;
  onSubmit: (category: SupportRequestCategory, description: string) => void;
}) {
  const [category, setCategory] = useState<SupportRequestCategory>('order_service');
  const [description, setDescription] = useState('');

  function handlePrimaryAction() {
    if (submitted) {
      onClose();
      return;
    }
    onSubmit(category, description);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]" role="dialog" aria-modal="true">
      <section className="w-full max-w-md rounded-[12px] bg-white p-4 text-zinc-950 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-800">
            <Headphones size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-zinc-400">{account?.phone ?? '未登录账号'} · {roleLabel}</p>
            <h2 className="mt-1 text-xl font-black">联系客服</h2>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700" type="button" onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {supportRequestCategoryOptions.map((option) => {
            const active = option.value === category;
            return (
              <button
                key={option.value}
                className={`h-10 rounded-[10px] text-sm font-black ${active ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700'}`}
                type="button"
                onClick={() => setCategory(option.value)}
                disabled={submitted}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-black text-zinc-400">补充说明</span>
          <textarea
            className="mt-1 min-h-24 w-full resize-none rounded-[10px] bg-zinc-100 px-3 py-3 text-sm font-semibold leading-5 text-zinc-900 outline-none placeholder:text-zinc-400"
            placeholder="简单说一下订单、退款、举报或账号问题，方便后台跟进。"
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, 180))}
            disabled={submitted}
          />
        </label>

        {submitted ? (
          <p className="mt-4 rounded-[10px] bg-emerald-50 px-3 py-2 text-xs font-black leading-5 text-emerald-700">
            客服请求已提交，后台可在举报处理中跟进。
          </p>
        ) : null}

        <button
          className="mt-5 h-11 w-full rounded-full bg-zinc-950 text-sm font-black text-white disabled:bg-zinc-300"
          type="button"
          onClick={handlePrimaryAction}
          disabled={!account}
        >
          {submitted ? '我知道了' : '提交客服请求'}
        </button>
      </section>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return <p className="mt-3 rounded-[10px] bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{text}</p>;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试';
}

function getPublicRoleLabel(role: PublicRole) {
  return role === 'companion' ? 'Studio' : 'Client';
}
