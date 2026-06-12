import { ChevronRight, Heart, ReceiptText, Settings, ShieldCheck, Store, UserRound, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchAuthSession, switchMockRole } from '../../services/authService';
import type { AuthSession, UserRole } from '../../types/api';

const items = [
  { icon: ReceiptText, label: '我的订单', to: '/consumer/orders' },
  { icon: Heart, label: '收藏的作品', to: '/consumer' },
  { icon: ShieldCheck, label: '安全与实名认证', to: '/consumer/mine' },
  { icon: Settings, label: '设置', to: '/consumer/mine' },
];

const roleActions: Array<{ role: UserRole; label: string; desc: string; to: string }> = [
  { role: 'consumer', label: '消费者', desc: '浏览、预约、支付、聊天', to: '/consumer' },
  { role: 'companion', label: '陪拍者', desc: '资料、档期、订单、收入', to: '/companion' },
  { role: 'admin', label: '管理员', desc: '审核、风控、订单、财务', to: '/admin' },
];

const roleLabels: Record<UserRole, string> = {
  consumer: '消费者',
  companion: '陪拍者',
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
        <div className="mb-3 flex items-center gap-2 px-1">
          <Wrench size={17} className="text-[#e85d75]" />
          <h2 className="text-sm font-black text-[#3f302c]">MVP 角色切换</h2>
        </div>
        <div className="space-y-2">
          {roleActions.map((item) => (
            <button
              key={item.role}
              className={`flex min-h-14 w-full items-center gap-3 rounded-[8px] px-3 text-left ${
                session?.role === item.role ? 'bg-[#fff1f3] text-[#3f302c] ring-1 ring-[#f4c8d1]' : 'bg-[#fbf7f2] text-[#5f514b]'
              }`}
              onClick={() => handleRoleSwitch(item.role, item.to)}
              disabled={loadingRole !== null}
            >
              <Store size={18} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black">{item.label}</span>
                <span className="mt-0.5 block text-xs opacity-70">{loadingRole === item.role ? '切换中...' : item.desc}</span>
              </span>
              <ChevronRight size={17} className="shrink-0 opacity-50" />
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 divide-y divide-zinc-100 rounded-[10px] border border-zinc-200 bg-white">
        {items.map(({ icon: Icon, label, to }) => (
          <Link key={label} to={to} className="flex h-14 w-full items-center gap-3 px-4 text-left">
            <Icon size={19} />
            <span className="flex-1 text-sm font-semibold">{label}</span>
            <ChevronRight className="text-zinc-300" size={18} />
          </Link>
        ))}
      </section>
    </div>
  );
}
