import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { isAdminSessionActive, loginLocalAdmin } from '../../services/authService';
import { isTestRoleSwitchAllowed } from '../../services/apiClient';

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  if (!isAdminSessionActive()) return <Navigate to="/admin/login" replace />;
  return children;
}

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');

  if (isAdminSessionActive()) return <Navigate to="/admin" replace />;

  function login() {
    setError('');
    try {
      loginLocalAdmin(passcode);
      navigate('/admin', { replace: true });
    } catch (nextError) {
      setError(getAdminErrorMessage(nextError));
    }
  }

  return (
    <AdminAuthFrame eyebrow="Still Admin" title="运营后台登录">
      <label className="block">
        <span className="text-xs font-black text-zinc-400">管理员口令</span>
        <input
          className="mt-1 h-12 w-full rounded-[10px] bg-zinc-100 px-3 text-base font-bold outline-none"
          inputMode="numeric"
          maxLength={6}
          placeholder={isTestRoleSwitchAllowed() ? '本地测试口令 000000' : '请输入管理员口令'}
          value={passcode}
          onChange={(event) => setPasscode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') login();
          }}
        />
      </label>
      {error ? <AdminErrorLine text={error} /> : null}
      <button className="mt-5 h-12 w-full rounded-full bg-zinc-950 text-sm font-black text-white" type="button" onClick={login}>
        进入后台
      </button>
    </AdminAuthFrame>
  );
}

function AdminAuthFrame({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#050505] px-5 py-8 text-white">
      <section className="mx-auto max-w-md">
        <div className="pt-8">
          <p className="text-sm font-black text-white/45">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-black tracking-normal">{title}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-white/52">运营入口独立于 Still 移动端，用于审核、风控、订单和结算处理。</p>
        </div>
        <div className="mt-7 rounded-[8px] bg-white p-4 text-zinc-950 shadow-2xl ring-1 ring-white/10">{children}</div>
      </section>
    </div>
  );
}

function AdminErrorLine({ text }: { text: string }) {
  return <p className="mt-3 rounded-[10px] bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{text}</p>;
}

function getAdminErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试';
}
