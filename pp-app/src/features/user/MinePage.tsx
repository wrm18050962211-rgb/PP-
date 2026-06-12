import { Bookmark, Camera, ChevronRight, Heart, ReceiptText, Settings, ShieldCheck, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchAuthSession, switchMockRole } from '../../services/authService';
import type { AuthSession, UserRole } from '../../types/api';

const menuItems = [
  { icon: ReceiptText, label: '我的订单', desc: '预约、支付、售后', to: '/consumer/orders' },
  { icon: Heart, label: '点赞的作品', desc: '喜欢过的图片', to: '/consumer' },
  { icon: Bookmark, label: '收藏的作品', desc: '稍后再拍的样板', to: '/consumer' },
  { icon: Settings, label: '设置', desc: '账号、安全与实名认证', to: '/consumer/mine' },
];

const roleActions: Array<{ role: UserRole; label: string; desc: string; to: string; icon: typeof UserRound }> = [
  { role: 'consumer', label: '创作者', desc: '作品、点赞、收藏、预约', to: '/consumer', icon: UserRound },
  { role: 'companion', label: '摄影师', desc: '资料、档期、订单、收入', to: '/companion', icon: Camera },
];

const adminAction = { role: 'admin' as const, label: '管理员', desc: '审核、风控、订单、财务', to: '/admin', icon: ShieldCheck };

const roleLabels: Record<UserRole, string> = {
  consumer: '创作者',
  companion: '摄影师',
  admin: '管理员',
};

export function MinePage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loadingRole, setLoadingRole] = useState<UserRole | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchAuthSession().then((nextSession) => {
      if (mounted) setSession(nextSession);
    });

    return () => {
      mounted = false;
    };
  }, []);

  async function handleRoleSwitch(role: UserRole, to: string) {
    setLoadingRole(role);
    const nextSession = await switchMockRole(role);
    setSession(nextSession);
    setLoadingRole(null);
    navigate(to);
  }

  return (
    <div className="px-4 py-5">
      <h1 className="text-2xl font-bold text-[#3f302c]">我的</h1>

      <section className="mt-5 rounded-[10px] bg-zinc-950 p-5 text-white">
        <p className="text-sm text-white/70">Hi，欢迎来到 PP</p>
        <h2 className="mt-2 text-2xl font-bold">找到懂你的拍照搭子</h2>
        <div className="mt-5 rounded-[8px] bg-white/10 p-3">
          <p className="text-xs font-semibold text-white/60">当前本地会话</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-white/15">
              <UserRound size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{session?.user.nickname ?? '正在读取...'}</p>
              <p className="mt-0.5 text-xs text-white/60">{session ? `${roleLabels[session.role]} · ${session.provider}` : '本地 MVP 身份初始化中'}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-[10px] border border-zinc-200 bg-white p-3">
        <div className="grid grid-cols-2 gap-2">
          {roleActions.map((item) => {
            const Icon = item.icon;
            const active = session?.role === item.role;
            return (
              <button
                key={item.role}
                className={`min-h-20 rounded-[8px] px-3 py-3 text-left ${
                  active ? 'bg-[#fff1f3] text-[#3f302c] ring-1 ring-[#f4c8d1]' : 'bg-[#fbf7f2] text-[#5f514b]'
                }`}
                onClick={() => handleRoleSwitch(item.role, item.to)}
                disabled={loadingRole !== null}
              >
                <Icon size={18} className="mb-2" />
                <span className="block text-sm font-black">{item.label}</span>
                <span className="mt-1 block text-xs leading-4 opacity-70">{loadingRole === item.role ? '切换中...' : item.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-3">
        <button
          className={`flex min-h-12 w-full items-center gap-3 rounded-[8px] px-3 text-left ${
            session?.role === 'admin' ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-500'
          }`}
          onClick={() => handleRoleSwitch(adminAction.role, adminAction.to)}
          disabled={loadingRole !== null}
        >
          <ShieldCheck size={17} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black">{adminAction.label}</span>
            <span className="mt-0.5 block truncate text-xs opacity-70">{loadingRole === 'admin' ? '切换中...' : adminAction.desc}</span>
          </span>
          <ChevronRight size={17} className="shrink-0 opacity-50" />
        </button>
      </section>

      <section className="mt-5 divide-y divide-zinc-100 rounded-[10px] border border-zinc-200 bg-white">
        {menuItems.map(({ icon: Icon, label, desc, to }) => (
          <Link key={label} to={to} className="flex min-h-16 w-full items-center gap-3 px-4 text-left">
            <Icon size={19} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{label}</span>
              <span className="mt-0.5 block truncate text-xs text-zinc-400">{desc}</span>
            </span>
            <ChevronRight className="text-zinc-300" size={18} />
          </Link>
        ))}
      </section>
    </div>
  );
}
